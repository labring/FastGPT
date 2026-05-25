import { NextAPI } from '@/service/middleware/entry';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { SkillPermission } from '@fastgpt/global/support/permission/skill/controller';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { AgentSkillTypeEnum, AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { ListSkillsQuerySchema, type ListSkillsQuery } from '@fastgpt/global/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  AppResourceRefsSkillIdsPath,
  buildAppSkillRefMongoQuery
} from '@fastgpt/service/core/app/resourceRefs';

export type GetSkillListBody = ListSkillsQuery;

const mergeMongoAndQuery = (...queries: Record<string, unknown>[]) => {
  const validQueries = queries.filter((query) => Object.keys(query).length > 0);

  if (validQueries.length === 0) return {};
  if (validQueries.length === 1) return validQueries[0];

  // 多个过滤条件都可能包含 $or，用 $and 合并避免对象展开时覆盖同名键。
  return {
    $and: validQueries
  };
};

async function handler(req: ApiRequestProps<GetSkillListBody>) {
  const { parentId, source, searchKey, category, type, skillIds, page, pageSize, withAppCount } =
    parseApiInput({ req, bodySchema: ListSkillsQuerySchema }).body;
  const selectedSkillIds = skillIds?.filter(Boolean) ?? [];
  const isSkillIdsQuery = selectedSkillIds.length > 0;

  // Auth user permission
  const [{ tmbId, teamId, permission: teamPer }] = await Promise.all([
    authUserPer({
      req,
      authToken: true,
      authApiKey: true,
      per: ReadPermissionVal
    }),
    ...(parentId && !isSkillIdsQuery
      ? [
          authSkill({
            req,
            authToken: true,
            authApiKey: true,
            per: ReadPermissionVal,
            skillId: parentId
          })
        ]
      : [])
  ]);

  // Get team all skill permissions
  const [roleList, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId,
      resourceId: {
        $exists: true
      }
    }).lean(),
    getGroupsByTmbId({
      tmbId,
      teamId
    }).then((item) => {
      const map = new Map<string, 1>();
      item.forEach((item) => {
        map.set(String(item._id), 1);
      });
      return map;
    }),
    getOrgIdSetWithParentByTmbId({
      teamId,
      tmbId
    })
  ]);

  const myRoles = roleList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );
  const myRoleResourceIds = Array.from(
    new Map(myRoles.map((item) => [String(item.resourceId), item.resourceId])).values()
  );
  const roleCountByResourceId = new Map<string, number>();
  roleList.forEach((item) => {
    const resourceId = String(item.resourceId);
    roleCountByResourceId.set(resourceId, (roleCountByResourceId.get(resourceId) ?? 0) + 1);
  });

  const myTmbRoleByResourceId = new Map<string, ReturnType<typeof sumPer>>();
  const myGroupOrgRoleListByResourceId = new Map<string, Parameters<typeof sumPer>>();
  myRoles.forEach((item) => {
    const resourceId = String(item.resourceId);
    if (item.tmbId) {
      myTmbRoleByResourceId.set(resourceId, item.permission);
      return;
    }

    if (item.groupId || item.orgId) {
      const permissionList = myGroupOrgRoleListByResourceId.get(resourceId) ?? [];
      permissionList.push(item.permission);
      myGroupOrgRoleListByResourceId.set(resourceId, permissionList);
    }
  });
  const myGroupOrgRoleByResourceId = new Map<string, ReturnType<typeof sumPer>>();
  myGroupOrgRoleListByResourceId.forEach((permissionList, resourceId) => {
    myGroupOrgRoleByResourceId.set(resourceId, sumPer(...permissionList));
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
      ...typeQuery
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

      return mergeMongoAndQuery(baseQuery, scopeQuery, {
        _id: { $in: selectedSkillIds },
        ...searchMatch
      });
    }

    // Filter skills by permission, if not owner, only get skills that I have permission to access
    const idList = { _id: { $in: myRoleResourceIds } };
    const skillPerQuery = teamPer.isOwner
      ? {}
      : parentId
        ? {
            $or: [idList, parseParentIdInMongo(parentId)]
          }
        : { $or: [idList, { parentId: null }] };
    // Only restrict by teamId for personal (mine) skills; store (system) skills are global
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

  const mySkills = await MongoAgentSkills.find(findSkillQuery)
    .sort({
      type: -1, // Folders first
      updateTime: -1
    })
    .lean();

  const formatSkills = mySkills
    .map((skill) => {
      const { Per, privateSkill } = (() => {
        const getPer = (skillId: string) => {
          const tmbRole = myTmbRoleByResourceId.get(skillId);
          const groupAndOrgRole = myGroupOrgRoleByResourceId.get(skillId);
          return new SkillPermission({
            role: tmbRole ?? groupAndOrgRole,
            isOwner: String(skill.tmbId) === String(tmbId) || teamPer.isOwner
          });
        };
        const getClbCount = (skillId: string) => {
          return roleCountByResourceId.get(skillId) ?? 0;
        };

        // inherit
        if (skill.inheritPermission && skill.parentId && skill.type !== AgentSkillTypeEnum.folder) {
          return {
            Per: getPer(String(skill.parentId)).addRole(getPer(String(skill._id)).role),
            privateSkill: getClbCount(String(skill.parentId)) <= 1
          };
        }
        return {
          Per: getPer(String(skill._id)),
          privateSkill: getClbCount(String(skill._id)) <= 1
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

  const total = formatSkills.length;

  // Apply pagination if requested
  const pagedSkills = (() => {
    if (page && pageSize) {
      const skip = (page - 1) * pageSize;
      return formatSkills.slice(skip, skip + pageSize);
    }
    return formatSkills;
  })();

  // 默认保持历史行为返回 appCount；只统计本次返回的 skill，编辑页状态校验可显式关闭。
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

  const listWithSourceMember = await addSourceMember({ list: listWithAppCount });
  return { list: listWithSourceMember, total };
}

export default NextAPI(handler);
