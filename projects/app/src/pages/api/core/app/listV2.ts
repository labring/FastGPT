import { NextAPI } from '@/service/middleware/entry';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { normalizeParentId } from '@fastgpt/global/common/parentFolder/depth';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { getVisibleChildren } from '@fastgpt/global/common/parentFolder/visibleChildren';
import { AppTypeEnum, appListSortMongoMap } from '@fastgpt/global/core/app/constants';
import {
  countTeamAppsByPublishedResourceGroups,
  getAppPublishedResourceType
} from '@fastgpt/service/core/app/resourceLookup';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { findAppsPage } from '@fastgpt/service/core/app/entity';
import { getInteractiveAppIdSet } from '@fastgpt/service/core/app/version/controller';
import { AppRolePerMap } from '@fastgpt/global/support/permission/app/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { isPrivateResourceByCollaborators, sumPer } from '@fastgpt/global/support/permission/utils';
import {
  findResourceKeysByCollaboratorsPermission,
  getResourcePermissionsByResourceIds
} from '@fastgpt/service/support/permission/resourcePermissionService';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ListAppV2BodySchema,
  ListAppV2ResponseSchema,
  type ListAppV2BodyType,
  type ListAppV2ResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { Types } from '@fastgpt/service/common/mongo';
import { getAppFolderListScope, hasReadableAppFolderChild } from '@/service/core/app/visibleList';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { normalizePagination } from '@fastgpt/service/common/api/pagination';

/** 分页或按 ID 列出可读应用；解析时优先保留 ID 查询字段，仍受团队、权限及公共筛选条件约束。 */
async function handler(req: ApiRequestProps<ListAppV2BodyType>): Promise<ListAppV2ResponseType> {
  const body = parseApiInput({ req, bodySchema: ListAppV2BodySchema }).body;
  const { appIds, type, searchKey, sort, tmbIds, pinnedFirst, excludeAppId, withRelatedAppCount } =
    body;
  const pagination = body.appIds === undefined ? body : undefined;
  const parentId = pagination?.parentId;
  const { pageSize, offset } = normalizePagination(pagination ?? {});
  const isAppIdsQuery = appIds !== undefined;
  const currentFolderId = normalizeParentId(parentId);

  const {
    tmbId,
    teamId,
    permission: teamPer
  } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  if (Array.isArray(tmbIds) && tmbIds.length === 0) {
    return ListAppV2ResponseSchema.parse({ list: [], total: 0 });
  }

  const { readableResourceIds, groupIds, orgIds } = await (async () => {
    if (teamPer.isOwner) return { readableResourceIds: [], groupIds: [], orgIds: [] };
    const [groups, orgSet] = await Promise.all([
      getGroupsByTmbId({ tmbId, teamId }),
      getOrgIdSetWithParentByTmbId({ teamId, tmbId })
    ]);
    const groupIds = groups.map((item) => String(item._id));
    const orgIds = Array.from(orgSet).map(String);
    const readableResourceIds = await findResourceKeysByCollaboratorsPermission({
      resourceType: PerResourceTypeEnum.app,
      teamId,
      tmbId,
      groupIds,
      orgIds,
      permission: ReadPermissionVal,
      matchLogic: 'or',
      personalPermissionPriority: true,
      rolePerMap: AppRolePerMap
    });
    return { readableResourceIds, groupIds, orgIds };
  })();

  const folderScope =
    !isAppIdsQuery && (parentId || !teamPer.isOwner || searchKey)
      ? await getAppFolderListScope({ teamId, currentFolderId })
      : { folders: [], folderIds: [] };
  if (parentId) {
    const currentFolder = folderScope.folders.find(({ _id }) => _id === parentId);
    if (!currentFolder) {
      await authApp({
        req,
        authToken: true,
        authApiKey: true,
        appId: parentId,
        per: ReadPermissionVal
      });
      throw CommonErrEnum.invalidParams;
    }
    if (
      !teamPer.isOwner &&
      !readableResourceIds.some((id) => String(id) === parentId) &&
      !(await hasReadableAppFolderChild({
        teamId,
        folderIds: folderScope.folderIds,
        readableResourceIds
      }))
    ) {
      await authApp({
        req,
        authToken: true,
        authApiKey: true,
        appId: parentId,
        per: ReadPermissionVal
      });
    }
  }

  const searchMatch = searchKey
    ? {
        $or: [
          { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
          { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
        ]
      }
    : undefined;
  const appTypeFilter = type
    ? Array.isArray(type)
      ? { $in: type }
      : type
    : { $ne: AppTypeEnum.hidden };
  const permissionQuery = teamPer.isOwner ? {} : { _id: { $in: readableResourceIds } };
  const baseQuery = {
    teamId,
    type: appTypeFilter,
    deleteTime: null,
    ...permissionQuery,
    ...(tmbIds ? { tmbId: { $in: tmbIds } } : {})
  };
  const isMergedList = !isAppIdsQuery && !teamPer.isOwner && !searchKey;
  const parentScopeQuery = (() => {
    // ID 查询不参与目录导航，保留 ACL 与请求 ID 的交集。
    if (isAppIdsQuery) return { _id: { $in: appIds } };
    if (!searchKey && teamPer.isOwner) return parseParentIdInMongo(parentId);
    if (parentId) return { parentId: { $in: folderScope.folderIds } };
    return {
      $or: [
        { parentId: null },
        ...(folderScope.folderIds.length ? [{ parentId: { $in: folderScope.folderIds } }] : [])
      ]
    };
  })();
  const findAppsQuery = {
    $and: [
      baseQuery,
      parentScopeQuery,
      ...(excludeAppId ? [{ _id: { $ne: excludeAppId } }] : []),
      ...(searchMatch ? [searchMatch] : [])
    ]
  };
  const fields = `_id parentId avatar type name intro tmbId createTime updateTime pluginData inheritPermission publishedVersionId${
    pinnedFirst ? ' isPinned pinnedAt' : ''
  }`;
  let myApps: Awaited<ReturnType<typeof findAppsPage>>['list'];
  let total: number;
  const folderAccessModeMap = new Map<string, 'read' | 'navigate'>();

  if (isMergedList) {
    const readableResources = await MongoApp.find(findAppsQuery, '_id parentId type').lean();
    const includedFolderTypes = type
      ? (Array.isArray(type) ? type : [type]).filter(
          (item): item is AppTypeEnum.folder | AppTypeEnum.toolFolder =>
            item === AppTypeEnum.folder || item === AppTypeEnum.toolFolder
        )
      : [AppTypeEnum.folder, AppTypeEnum.toolFolder];
    const visibleChildren = getVisibleChildren({
      currentFolderId,
      readableResources: readableResources.map((app) => ({
        _id: String(app._id),
        parentId: app.parentId ? String(app.parentId) : null,
        type: app.type
      })),
      folders: folderScope.folders,
      folderTypes: [AppTypeEnum.folder, AppTypeEnum.toolFolder],
      includedFolderTypes
    });
    visibleChildren.forEach(({ id, folderAccessMode }) => {
      if (folderAccessMode) folderAccessModeMap.set(id, folderAccessMode);
    });

    const visibleIds = visibleChildren.map(({ id }) => id);
    const visibleApps = visibleIds.length
      ? await MongoApp.find({ _id: { $in: visibleIds }, teamId, deleteTime: null }, fields).lean()
      : [];
    const sortField = sort
      ? Object.entries(appListSortMongoMap[sort])[0]
      : (['updateTime', -1] as const);
    const compareValue = (left: unknown, right: unknown, direction: number) => {
      const leftValue = left instanceof Date ? left.getTime() : String(left ?? '');
      const rightValue = right instanceof Date ? right.getTime() : String(right ?? '');
      if (leftValue === rightValue) return 0;
      const comparison =
        typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true });
      return comparison * direction;
    };
    visibleApps.sort((a, b) => {
      if (pinnedFirst) {
        const pinRank = Number(b.isPinned === true) - Number(a.isPinned === true);
        if (pinRank) return pinRank;
        const primarySort = sort
          ? compareValue(
              a[sortField[0] as keyof typeof a],
              b[sortField[0] as keyof typeof b],
              sortField[1]
            )
          : compareValue(
              a.isPinned ? a.pinnedAt : a.updateTime,
              b.isPinned ? b.pinnedAt : b.updateTime,
              -1
            );
        if (primarySort) return primarySort;
      } else {
        const primarySort = compareValue(
          a[sortField[0] as keyof typeof a],
          b[sortField[0] as keyof typeof b],
          sortField[1]
        );
        if (primarySort) return primarySort;
      }
      return String(a._id).localeCompare(String(b._id));
    });
    total = visibleApps.length;
    myApps = visibleApps.slice(offset, offset + pageSize);
  } else {
    const result = await findAppsPage({
      filter: findAppsQuery,
      fields,
      sort,
      pinnedFirst,
      offset,
      limit: isAppIdsQuery ? appIds.length : pageSize
    });
    myApps = result.list;
    total = result.total;
  }
  for (const app of myApps) {
    if (
      (app.type === AppTypeEnum.folder || app.type === AppTypeEnum.toolFolder) &&
      !folderAccessModeMap.has(String(app._id))
    ) {
      folderAccessModeMap.set(String(app._id), 'read');
    }
  }

  const pageRoleList = await getResourcePermissionsByResourceIds({
    resourceType: PerResourceTypeEnum.app,
    teamId,
    resourceIds: myApps.map((app) => String(app._id))
  });
  const interactiveAppIds = await getInteractiveAppIdSet(myApps);
  const roleListMap = new Map<string, (typeof pageRoleList)[number][]>();
  pageRoleList.forEach((item) => {
    const resourceId = String(item.resourceId);
    const list = roleListMap.get(resourceId) ?? [];
    list.push(item);
    roleListMap.set(resourceId, list);
  });

  const formatApps = myApps.map((app) => {
    const { Per, privateApp } = (() => {
      const resourceClbs = roleListMap.get(String(app._id)) ?? [];
      const getPer = () => {
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
        return new AppPermission({
          role: tmbRole ?? groupAndOrgRole,
          isOwner: String(app.tmbId) === String(tmbId) || teamPer.isOwner
        });
      };
      return {
        Per: getPer(),
        privateApp: isPrivateResourceByCollaborators({ resourceClbs })
      };
    })();
    const { publishedVersionId: _publishedVersionId, ...rest } = app;
    return {
      ...rest,
      avatar: app.avatar,
      intro: app.intro ?? '',
      createTime: app.createTime ?? new Types.ObjectId(String(app._id)).getTimestamp(),
      parentId: app.parentId,
      permission: Per,
      private: privateApp,
      hasInteractiveNode: interactiveAppIds.has(String(app._id)),
      ...(folderAccessModeMap.has(String(app._id))
        ? { folderAccessMode: folderAccessModeMap.get(String(app._id)) }
        : {})
    };
  });

  const relatedAppCountMap = withRelatedAppCount
    ? await countTeamAppsByPublishedResourceGroups({
        teamId,
        resourceGroups: formatApps.flatMap((app) => {
          const type = getAppPublishedResourceType(app.type);
          if (!type) return [];

          const id = String(app._id);
          return [{ id, isOwner: app.permission.isOwner, resources: [{ type, id }] }];
        })
      })
    : undefined;
  const list = await addSourceMember({
    list: formatApps.map((app) => ({
      ...app,
      ...(app.permission.isOwner && relatedAppCountMap?.has(String(app._id))
        ? { relatedAppCount: relatedAppCountMap.get(String(app._id)) ?? 0 }
        : {})
    }))
  });
  return ListAppV2ResponseSchema.parse({ list, total });
}

export default NextAPI(handler);
