import { MongoAgentSkills } from '../model/schema';
import { SkillPermission } from '@fastgpt/global/support/permission/skill/controller';
import {
  NullRoleVal,
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import {
  findResourceKeysByCollaboratorsPermission,
  getResourcePermissionsByResourceIds
} from '../../../../support/permission/resourcePermissionService';
import { normalizeParentId } from '@fastgpt/global/common/parentFolder/depth';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { getVisibleChildren } from '@fastgpt/global/common/parentFolder/visibleChildren';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupsByTmbId } from '../../../../support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '../../../../support/permission/org/controllers';
import { addSourceMember } from '../../../../support/user/utils';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import type { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/ai/skill/constants';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { ListSkillsV2Query } from '@fastgpt/global/openapi/core/ai/skill/api';
import { AppListSortEnum, appListSortMongoMap } from '@fastgpt/global/core/app/constants';
import { countTeamAppsByPublishedResourceGroups } from '../../../app/resourceLookup';
import { getSkillFolderListScope } from './folder';

type TeamPermission = {
  isOwner: boolean;
};

type ListReadableAgentSkillsParams = ListSkillsV2Query & {
  teamId: string;
  tmbId: string;
  teamPer: TeamPermission;
  creationStatus?: AgentSkillCreationStatusEnum;
  /** 内部辅助生成可跳过引用统计；列表 API 固定返回有权限查看的引用数量。 */
  withAppCount?: boolean;
  withSourceMember?: boolean;
  withCurrentRuntimeSkills?: boolean;
  /**
   * 仅 V2 浏览开启。
   * 非所有者会合并通往可读后代的首层目录；带 parentId 的搜索限制在当前子树。
   * V1 仍只返回直接子项，搜索也不按目录收窄。
   */
  browseDescendants?: boolean;
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

/** 根据成员、用户组和组织 ACL 汇总当前成员可读取的 Skill ID。 */
export const getReadableAgentSkillIds = async ({
  teamId,
  tmbId,
  teamPer
}: {
  teamId: string;
  tmbId: string;
  teamPer: TeamPermission;
}) => {
  if (teamPer.isOwner) return [];

  const [groups, orgSet] = await Promise.all([
    getGroupsByTmbId({ tmbId, teamId }),
    getOrgIdSetWithParentByTmbId({ teamId, tmbId })
  ]);

  return findResourceKeysByCollaboratorsPermission({
    resourceType: PerResourceTypeEnum.agentSkill,
    teamId,
    tmbId,
    groupIds: groups.map((item) => String(item._id)),
    orgIds: Array.from(orgSet).map(String),
    permission: ReadPermissionVal,
    matchLogic: 'or',
    personalPermissionPriority: true
  });
};

/** 判断用户能否读取或仅浏览指定 Skill 文件夹；navigate 仅由可读后代资源支撑。 */
export const getAgentSkillFolderAccess = async ({
  teamId,
  tmbId,
  teamPer,
  folderId
}: {
  teamId: string;
  tmbId: string;
  teamPer: TeamPermission;
  folderId: string;
}) => {
  const folderScope = await getSkillFolderListScope({ teamId, currentFolderId: folderId });
  const folder = folderScope.folders.find(({ _id }) => _id === folderId);
  if (!folder) {
    return { folderScope, folder: undefined, hasReadPermission: false, canBrowse: false };
  }
  if (teamPer.isOwner) {
    return { folderScope, folder, hasReadPermission: true, canBrowse: true };
  }

  const readableResourceIds = await getReadableAgentSkillIds({ teamId, tmbId, teamPer });
  const hasReadPermission = readableResourceIds.includes(folderId);
  const canBrowse =
    hasReadPermission ||
    Boolean(
      await MongoAgentSkills.exists({
        teamId,
        source: AgentSkillSourceEnum.personal,
        deleteTime: null,
        _id: { $in: readableResourceIds },
        parentId: { $in: folderScope.folderIds }
      })
    );

  return { folderScope, folder, hasReadPermission, canBrowse };
};

/**
 * 查询当前成员可读的 Agent Skill 列表。
 *
 * 这里集中维护 Skill 列表 API 和 ChatAgentHelper 共用的权限过滤规则：
 * owner 可读团队内资源；普通成员按成员、用户组、组织授权计算，目录只负责层级过滤。
 */
export const listReadableAgentSkills = async (params: ListReadableAgentSkillsParams) => {
  const {
    teamId,
    tmbId,
    teamPer,
    source,
    searchKey,
    category,
    type,
    skillIds,
    withAppCount,
    sort,
    tmbIds,
    creationStatus,
    withSourceMember = true,
    withCurrentRuntimeSkills = false,
    browseDescendants
  } = params;
  const pagination = params.skillIds === undefined ? params : undefined;
  const parentId = pagination?.parentId;
  const offset = pagination?.offset;
  const page = pagination?.page;
  const pageSize = pagination?.pageSize;
  if (Array.isArray(tmbIds) && tmbIds.length === 0) {
    return { list: [], total: 0 };
  }
  const isSkillIdsQuery = skillIds !== undefined;

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
  // 空字符串和 null 都表示根目录，避免 $in: [''] 把根列表滤空。
  const currentFolderId = normalizeParentId(parentId);
  const shouldBrowseDescendants = browseDescendants === true;
  const shouldMergeNavigationFolders =
    shouldBrowseDescendants &&
    !isSkillIdsQuery &&
    !searchKey &&
    !teamPer.isOwner &&
    source === 'mine';
  const shouldScopeSubtreeSearch =
    shouldBrowseDescendants &&
    !isSkillIdsQuery &&
    Boolean(searchKey && currentFolderId && source !== 'store');
  const folderScope =
    shouldMergeNavigationFolders || shouldScopeSubtreeSearch
      ? await getSkillFolderListScope({ teamId, currentFolderId })
      : undefined;

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
      ...(tmbIds ? { tmbId: { $in: tmbIds } } : {}),
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
        _id: { $in: skillIds },
        ...searchMatch
      });
    }

    // 子树搜索和普通列表都限制在当前父目录下；根目录搜索仍匹配整个团队。
    const skillPerQuery =
      teamPer.isOwner || source === 'store' ? {} : { _id: { $in: readableResourceIds } };
    const teamIdQuery = source === 'store' ? {} : { teamId };
    const parentQuery = (() => {
      if (folderScope) {
        return currentFolderId
          ? { parentId: { $in: folderScope.folderIds } }
          : {
              $or: [{ parentId: null }, { parentId: { $in: folderScope.folderIds } }]
            };
      }
      return searchKey ? {} : parseParentIdInMongo(parentId);
    })();

    return mergeMongoAndQuery(skillPerQuery, teamIdQuery, baseQuery, parentQuery, searchMatch);
  })();

  const paged = offset !== undefined || (page !== undefined && pageSize !== undefined);
  const skip = paged ? (offset ?? (page! - 1) * pageSize!) : 0;
  const skillQuery = MongoAgentSkills.find(findSkillQuery)
    .sort({ ...appListSortMongoMap[sort ?? AppListSortEnum.updateTimeDesc], _id: -1 })
    .skip(paged && !shouldMergeNavigationFolders ? skip : 0);
  if (paged && !shouldMergeNavigationFolders) skillQuery.limit(pageSize!);
  const [mySkills, dbTotal] = await Promise.all([
    skillQuery.lean(),
    paged && !shouldMergeNavigationFolders
      ? MongoAgentSkills.countDocuments(findSkillQuery)
      : Promise.resolve(undefined)
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

  const folderAccessModeById = new Map<string, 'read' | 'navigate'>();
  let total = dbTotal ?? formatSkills.length;
  let pagedSkills: Array<
    (typeof formatSkills)[number] & { folderAccessMode?: 'read' | 'navigate' }
  > = formatSkills;

  if (shouldMergeNavigationFolders && folderScope) {
    const visibleChildren = getVisibleChildren({
      currentFolderId,
      readableResources: formatSkills.map((skill) => ({
        _id: String(skill._id),
        parentId: skill.parentId ? String(skill.parentId) : null,
        type: skill.type
      })),
      folders: folderScope.folders,
      folderTypes: [AgentSkillTypeEnum.folder],
      includedFolderTypes:
        !type || type === AgentSkillTypeEnum.folder ? [AgentSkillTypeEnum.folder] : []
    });
    const visibleIds = visibleChildren.map(({ id, folderAccessMode }) => {
      if (folderAccessMode) folderAccessModeById.set(id, folderAccessMode);
      return id;
    });
    total = visibleIds.length;

    const visiblePageQuery = MongoAgentSkills.find({ _id: { $in: visibleIds } })
      .sort({ ...appListSortMongoMap[sort ?? AppListSortEnum.updateTimeDesc], _id: -1 })
      .skip(skip);
    if (paged) visiblePageQuery.limit(pageSize!);
    const visiblePage = await visiblePageQuery.lean();
    const readableSkillById = new Map(formatSkills.map((skill) => [String(skill._id), skill]));
    const visibleFolderById = new Map(folderScope.folders.map((folder) => [folder._id, folder]));

    pagedSkills = visiblePage.map((skill) => {
      const id = String(skill._id);
      const folderAccessMode = folderAccessModeById.get(id);
      const readableSkill = readableSkillById.get(id);
      if (readableSkill) {
        return {
          ...readableSkill,
          ...(folderAccessMode ? { folderAccessMode } : {})
        };
      }

      const folder = visibleFolderById.get(id);
      return {
        _id: skill._id,
        avatar: folder?.avatar,
        name: folder?.name ?? skill.name,
        description: '',
        type: AgentSkillTypeEnum.folder,
        source: AgentSkillSourceEnum.personal,
        category: [],
        inheritPermission: skill.inheritPermission,
        currentVersionId: undefined,
        ...(withCurrentRuntimeSkills ? { currentRuntimeSkills: [] } : {}),
        creationStatus: skill.creationStatus,
        tmbId: '',
        parentId: skill.parentId,
        createTime: skill.createTime,
        updateTime: skill.updateTime,
        permission: new SkillPermission({ role: NullRoleVal }),
        private: true,
        folderAccessMode: 'navigate' as const
      };
    });
  }

  const appCountMap =
    withAppCount === false
      ? undefined
      : await countTeamAppsByPublishedResourceGroups({
          teamId,
          resourceGroups: pagedSkills
            .filter((skill) => skill.type !== AgentSkillTypeEnum.folder)
            .map((skill) => {
              const id = String(skill._id);
              return {
                id,
                isOwner: skill.permission.isOwner,
                resources: [{ type: 'skill', id }]
              };
            })
        });

  const listWithAppCount = pagedSkills.map((skill) => ({
    ...skill,
    ...(skill.permission.isOwner && appCountMap?.has(skill._id.toString())
      ? { appCount: appCountMap.get(skill._id.toString()) ?? 0 }
      : {})
  }));
  const skillsWithSourceMember = withSourceMember
    ? await addSourceMember({
        list: listWithAppCount.filter((skill) => skill.folderAccessMode !== 'navigate')
      })
    : [];
  const sourceMemberById = new Map(
    skillsWithSourceMember.map((skill) => [String(skill._id), skill])
  );
  const list = listWithAppCount.map((skill) => sourceMemberById.get(String(skill._id)) ?? skill);

  return { list, total };
};
