import { Types } from '../../../../common/mongo';
import { MongoApp } from '../../../app/schema';
import { AppResourceRefsSkillIdsPath, buildAppSkillRefMongoQuery } from '../../../app/resourceRefs';
import { MongoAgentSkills } from '../model/schema';
import { SkillPermission } from '@fastgpt/global/support/permission/skill/controller';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import {
  findResourceKeysByCollaboratorsPermission,
  getResourcePermissionsByResourceIds
} from '../../../../support/permission/resourcePermissionService';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupsByTmbId } from '../../../../support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '../../../../support/permission/org/controllers';
import { addSourceMember } from '../../../../support/user/utils';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import type { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/ai/skill/constants';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { ListSkillsQuery } from '@fastgpt/global/core/ai/skill/api';

type TeamPermission = {
  isOwner: boolean;
};

type ListReadableAgentSkillsParams = ListSkillsQuery & {
  teamId: string;
  tmbId: string;
  teamPer: TeamPermission;
  creationStatus?: AgentSkillCreationStatusEnum;
  withSourceMember?: boolean;
  withCurrentRuntimeSkills?: boolean;
};

const mergeMongoAndQuery = (...queries: Record<string, unknown>[]) => {
  const validQueries = queries.filter((query) => Object.keys(query).length > 0);

  if (validQueries.length === 0) return {};
  if (validQueries.length === 1) return validQueries[0];

  // 多个过滤条件都可能包含 $or，用 $and 合并避免对象展开时覆盖同名键。
  return {
    $and: validQueries
  };
};

/**
 * 查询当前成员可读的 Agent Skill 列表。
 *
 * 这里集中维护 Skill 列表 API 和 ChatAgentHelper 共用的权限过滤规则：
 * owner 可读团队内资源；普通成员按成员、用户组、组织授权计算，目录只负责层级过滤。
 */
export const listReadableAgentSkills = async ({
  teamId,
  tmbId,
  teamPer,
  parentId,
  source,
  searchKey,
  category,
  type,
  skillIds,
  offset,
  page,
  pageSize,
  withAppCount,
  creationStatus,
  withSourceMember = true,
  withCurrentRuntimeSkills = false
}: ListReadableAgentSkillsParams) => {
  const selectedSkillIds = skillIds?.filter(Boolean) ?? [];
  const isSkillIdsQuery = selectedSkillIds.length > 0;

  const [groups, orgSet] = await Promise.all([
    getGroupsByTmbId({ tmbId, teamId }),
    getOrgIdSetWithParentByTmbId({ teamId, tmbId })
  ]);
  const groupIds = groups.map((item) => String(item._id));
  const orgIds = Array.from(orgSet).map(String);
  const readableResourceIds =
    teamPer.isOwner || source === 'store'
      ? []
      : await findResourceKeysByCollaboratorsPermission({
          resourceType: PerResourceTypeEnum.agentSkill,
          teamId,
          tmbId,
          groupIds,
          orgIds,
          permission: ReadPermissionVal,
          matchLogic: 'or',
          personalPermissionPriority: true
        });

  const findSkillQuery = (() => {
    const sourceQuery = (() => {
      if (source === 'store') return { source: AgentSkillSourceEnum.system };
      if (source === 'mine') return { source: AgentSkillSourceEnum.personal };
      return {};
    })();
    const typeQuery = {
      ...(category ? { category: { $in: [category] } } : {}),
      ...(type ? { type } : {})
    };
    const baseQuery = {
      deleteTime: null,
      ...sourceQuery,
      ...typeQuery,
      ...(creationStatus ? { creationStatus } : {})
    };
    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            { description: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
          ]
        }
      : {};

    if (isSkillIdsQuery) {
      const scopeQuery = source
        ? source === 'store'
          ? {}
          : { teamId }
        : {
            $or: [{ teamId }, { source: AgentSkillSourceEnum.system }]
          };
      const readPermissionQuery =
        teamPer.isOwner || source === 'store' ? {} : { _id: { $in: readableResourceIds } };

      return mergeMongoAndQuery(baseQuery, scopeQuery, readPermissionQuery, {
        _id: { $in: selectedSkillIds },
        ...searchMatch
      });
    }

    // 普通列表查询同时按当前目录和资源自身 ACL 过滤。
    const skillPerQuery =
      teamPer.isOwner || source === 'store' ? {} : { _id: { $in: readableResourceIds } };
    const teamIdQuery = source === 'store' ? {} : { teamId };

    if (searchKey) {
      return mergeMongoAndQuery(skillPerQuery, teamIdQuery, baseQuery, searchMatch);
    }

    return mergeMongoAndQuery(
      skillPerQuery,
      teamIdQuery,
      baseQuery,
      parseParentIdInMongo(parentId)
    );
  })();

  const paged = offset !== undefined || (page !== undefined && pageSize !== undefined);
  const skip = paged ? (offset ?? (page! - 1) * pageSize!) : 0;
  const skillQuery = MongoAgentSkills.find(findSkillQuery)
    .sort({ type: -1, updateTime: -1, _id: -1 })
    .skip(skip);
  if (paged) skillQuery.limit(pageSize!);
  const [mySkills, dbTotal] = await Promise.all([
    skillQuery.lean(),
    paged ? MongoAgentSkills.countDocuments(findSkillQuery) : Promise.resolve(undefined)
  ]);

  const pageRoleList = await getResourcePermissionsByResourceIds({
    resourceType: PerResourceTypeEnum.agentSkill,
    teamId,
    resourceIds: mySkills.map((skill) => String(skill._id))
  });
  const pageRoleListMap = new Map<string, (typeof pageRoleList)[number][]>();
  pageRoleList.forEach((item) => {
    const resourceId = String(item.resourceId);
    const list = pageRoleListMap.get(resourceId) ?? [];
    list.push(item);
    pageRoleListMap.set(resourceId, list);
  });

  const formatSkills = mySkills
    .map((skill) => {
      const { Per, privateSkill } = (() => {
        const resourceClbs = pageRoleListMap.get(String(skill._id)) ?? [];
        const getPer = () => {
          if (skill.source === AgentSkillSourceEnum.system) {
            return new SkillPermission({ role: 0b100 });
          }
          const tmbRole = resourceClbs.find(
            (item) => String(item.tmbId) === String(tmbId)
          )?.permission;
          const groupAndOrgRole = sumPer(
            ...resourceClbs
              .filter(
                (item) =>
                  (item.groupId && groupIds.includes(String(item.groupId))) ||
                  (item.orgId && orgIds.includes(String(item.orgId)))
              )
              .map((item) => item.permission)
          );
          return new SkillPermission({
            role: tmbRole ?? groupAndOrgRole,
            isOwner: String(skill.tmbId) === String(tmbId) || teamPer.isOwner
          });
        };

        return {
          Per: getPer(),
          privateSkill: resourceClbs.length <= 1
        };
      })();

      return {
        _id: skill._id,
        avatar: skill.avatar,
        name: skill.name,
        description: skill.description,
        type: skill.type,
        source: skill.source,
        category: skill.category,
        inheritPermission: skill.inheritPermission,
        currentVersionId: skill.currentVersionId ? String(skill.currentVersionId) : undefined,
        ...(withCurrentRuntimeSkills
          ? { currentRuntimeSkills: skill.currentRuntimeSkills ?? [] }
          : {}),
        creationStatus: skill.creationStatus,
        tmbId: skill.tmbId,
        parentId: skill.parentId,
        createTime: skill.createTime,
        updateTime: skill.updateTime,
        permission: Per,
        private: privateSkill
      };
    })
    .filter((skill) => skill.permission.hasReadPer);

  const total = dbTotal ?? formatSkills.length;
  const pagedSkills = formatSkills;

  const nonFolderSkills =
    withAppCount !== false ? pagedSkills.filter((s) => s.type !== AgentSkillTypeEnum.folder) : [];
  const appCountMap = new Map<string, number>();
  if (nonFolderSkills.length > 0) {
    const skillIdStrings = nonFolderSkills.map((skill) => String(skill._id));
    const counts = await MongoApp.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          teamId: new Types.ObjectId(String(teamId)),
          deleteTime: null,
          ...buildAppSkillRefMongoQuery(skillIdStrings)
        }
      },
      { $unwind: `$${AppResourceRefsSkillIdsPath}` },
      { $match: buildAppSkillRefMongoQuery(skillIdStrings) },
      {
        $group: {
          _id: `$${AppResourceRefsSkillIdsPath}`,
          count: { $sum: 1 }
        }
      }
    ]);
    counts.forEach((item) => {
      appCountMap.set(String(item._id), item.count);
    });
  }

  const listWithAppCount = pagedSkills.map((skill) => ({
    ...skill,
    appCount: appCountMap.get(skill._id.toString()) ?? 0
  }));
  const list = withSourceMember
    ? await addSourceMember({ list: listWithAppCount })
    : listWithAppCount;

  return { list, total };
};
