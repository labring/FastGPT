import { MongoApp } from '@fastgpt/service/core/app/schema';
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
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { isPrivateResourceByCollaborators, sumPer } from '@fastgpt/global/support/permission/utils';
import {
  findResourceKeysByCollaboratorsPermission,
  getResourcePermissionsByResourceIds
} from '@fastgpt/service/support/permission/resourcePermissionService';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ListAppBodySchema,
  ListAppResponseSchema,
  type ListAppBodyType,
  type ListAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { Types } from '@fastgpt/service/common/mongo';

async function handler(req: ApiRequestProps<ListAppBodyType>): Promise<ListAppResponseType> {
  const {
    parentId,
    type,
    searchKey,
    sort,
    tmbIds,
    pageNum = 1,
    pageSize = 50,
    offset
  } = parseApiInput({
    req,
    bodySchema: ListAppBodySchema
  }).body;

  // Auth user permission
  const [{ tmbId, teamId, permission: teamPer }] = await Promise.all([
    authUserPer({
      req,
      authToken: true,
      authApiKey: true,
      per: ReadPermissionVal
    }),
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

  // 空数组表示用户清空了创建者且未点「全部」，鉴权后直接返回空列表。
  if (Array.isArray(tmbIds) && tmbIds.length === 0) {
    return ListAppResponseSchema.parse({ list: [], total: 0 });
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

    const creatorMatch =
      Array.isArray(tmbIds) && tmbIds.length > 0 ? { tmbId: { $in: tmbIds } } : {};

    const _type = (() => {
      if (type) {
        // 如果明确指定了类型，则按指定类型查询（包括 hidden）
        return Array.isArray(type) ? { $in: type } : type;
      }
      // 如果没有指定类型，则排除 hidden 类型
      return { $ne: AppTypeEnum.hidden } as const;
    })();

    const permissionQuery = teamPer.isOwner ? {} : { _id: { $in: readableResourceIds } };
    const baseQuery = {
      teamId,
      type: _type,
      deleteTime: null,
      ...permissionQuery,
      ...creatorMatch
    };

    if (searchKey) {
      return {
        $and: [baseQuery, searchMatch]
      };
    }

    return {
      ...baseQuery,
      ...parseParentIdInMongo(parentId)
    };
  })();

  const skip = offset ?? (pageNum - 1) * pageSize;
  const [myApps, total] = await Promise.all([
    MongoApp.find(
      findAppsQuery,
      '_id parentId avatar type name intro tmbId createTime updateTime pluginData inheritPermission modules'
    )
      .sort({ ...appListSortMongoMap[sort ?? AppListSortEnum.updateTimeDesc], _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    MongoApp.countDocuments(findAppsQuery)
  ]);

  const pageResourceIds = myApps.map((app) => String(app._id));
  const pageRoleList = await getResourcePermissionsByResourceIds({
    resourceType: PerResourceTypeEnum.app,
    teamId,
    resourceIds: pageResourceIds
  });
  const roleListMap = new Map<string, (typeof pageRoleList)[number][]>();
  pageRoleList.forEach((item) => {
    const resourceId = String(item.resourceId);
    const list = roleListMap.get(resourceId) ?? [];
    list.push(item);
    roleListMap.set(resourceId, list);
  });

  // Add app permission and filter apps by read permission
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
        privateApp: isPrivateResourceByCollaborators({
          resourceClbs
        })
      };
    })();

    const { modules, ...rest } = app;
    const hasInteractiveNode = modules?.some((item) =>
      [FlowNodeTypeEnum.formInput, FlowNodeTypeEnum.userSelect].includes(item.flowNodeType)
    );

    return {
      ...rest,
      createTime: app.createTime ?? new Types.ObjectId(String(app._id)).getTimestamp(),
      parentId: app.parentId,
      permission: Per,
      private: privateApp,
      hasInteractiveNode
    };
  });

  const list = await addSourceMember({
    list: formatApps
  });

  return ListAppResponseSchema.parse({ list, total });
}

export default NextAPI(handler);
