import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { NextAPI } from '@/service/middleware/entry';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import {
  AppListSortEnum,
  appListSortMongoMap,
  AppTypeEnum
} from '@fastgpt/global/core/app/constants';
import { AppRolePerMap } from '@fastgpt/global/support/permission/app/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { isInteractiveNodeType } from '@fastgpt/global/core/workflow/node/constant';
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

async function handler(req: ApiRequestProps<ListAppV2BodyType>): Promise<ListAppV2ResponseType> {
  const {
    parentId,
    type,
    searchKey,
    sort,
    tmbIds,
    excludeAppId,
    pageNum = 1,
    pageSize = 50,
    offset
  } = parseApiInput({
    req,
    bodySchema: ListAppV2BodySchema
  }).body;

  const [{ tmbId, teamId, permission: teamPer }] = await Promise.all([
    authUserPer({ req, authToken: true, authApiKey: true, per: ReadPermissionVal }),
    ...(parentId
      ? [
          authApp({
            req,
            authToken: true,
            authApiKey: true,
            appId: parentId,
            per: ReadPermissionVal
          })
        ]
      : [])
  ]);

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

  const findAppsQuery = (() => {
    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
          ]
        }
      : {};
    const _type = (() => {
      if (type) return Array.isArray(type) ? { $in: type } : type;
      return { $ne: AppTypeEnum.hidden } as const;
    })();
    const permissionQuery = teamPer.isOwner ? {} : { _id: { $in: readableResourceIds } };
    const baseQuery = {
      teamId,
      type: _type,
      deleteTime: null,
      ...permissionQuery,
      ...(tmbIds ? { tmbId: { $in: tmbIds } } : {})
    };
    const scopedQuery = excludeAppId
      ? { $and: [baseQuery, { _id: { $ne: excludeAppId } }] }
      : baseQuery;
    if (searchKey) return { $and: [scopedQuery, searchMatch] };
    return { ...scopedQuery, ...parseParentIdInMongo(parentId) };
  })();

  const skip = offset ?? (pageNum - 1) * pageSize;
  const [myApps, total] = await Promise.all([
    MongoApp.find(
      findAppsQuery,
      '_id parentId avatar type name intro tmbId createTime updateTime pluginData inheritPermission publishedVersionId'
    )
      .sort({ ...appListSortMongoMap[sort ?? AppListSortEnum.updateTimeDesc], _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    MongoApp.countDocuments(findAppsQuery)
  ]);

  const getInteractiveAppIdSet = async () => {
    const pointerIds = myApps
      .map((app) => app.publishedVersionId)
      .filter((id): id is NonNullable<typeof id> => !!id && Types.ObjectId.isValid(String(id)));
    if (pointerIds.length === 0) return new Set<string>();

    const versions = await MongoAppVersion.find(
      { _id: { $in: pointerIds } },
      { _id: 1, appId: 1, nodes: 1 }
    ).lean();
    const versionById = new Map(versions.map((version) => [String(version._id), version]));
    const ids = new Set<string>();

    for (const app of myApps) {
      const version = app.publishedVersionId
        ? versionById.get(String(app.publishedVersionId))
        : undefined;
      if (!version || String(version.appId) !== String(app._id)) continue;
      if ((version.nodes ?? []).some((node) => isInteractiveNodeType(node.flowNodeType))) {
        ids.add(String(app._id));
      }
    }

    return ids;
  };

  const [pageRoleList, interactiveAppIds] = await Promise.all([
    getResourcePermissionsByResourceIds({
      resourceType: PerResourceTypeEnum.app,
      teamId,
      resourceIds: myApps.map((app) => String(app._id))
    }),
    getInteractiveAppIdSet()
  ]);
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
      hasInteractiveNode: interactiveAppIds.has(String(app._id))
    };
  });

  const list = await addSourceMember({ list: formatApps });
  return ListAppV2ResponseSchema.parse({ list, total });
}

export default NextAPI(handler);
