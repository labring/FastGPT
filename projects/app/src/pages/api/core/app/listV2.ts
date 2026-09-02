import { MongoApp } from '@fastgpt/service/core/app/schema';
import { NextAPI } from '@/service/middleware/entry';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
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
  ListAppV2BodySchema,
  ListAppV2ResponseSchema,
  type ListAppV2BodyType,
  type ListAppV2ResponseType
} from '@fastgpt/global/openapi/core/app/common/api';

async function handler(req: ApiRequestProps<ListAppV2BodyType>): Promise<ListAppV2ResponseType> {
  const {
    parentId,
    type,
    searchKey,
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
    const baseQuery = { teamId, type: _type, deleteTime: null, ...permissionQuery };
    if (searchKey) return { $and: [baseQuery, searchMatch] };
    return { ...baseQuery, ...parseParentIdInMongo(parentId) };
  })();

  const skip = offset ?? (pageNum - 1) * pageSize;
  const [myApps, total] = await Promise.all([
    MongoApp.find(
      findAppsQuery,
      '_id parentId avatar type name intro tmbId updateTime pluginData inheritPermission modules'
    )
      .sort({ updateTime: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    MongoApp.countDocuments(findAppsQuery)
  ]);

  const pageRoleList = await getResourcePermissionsByResourceIds({
    resourceType: PerResourceTypeEnum.app,
    teamId,
    resourceIds: myApps.map((app) => String(app._id))
  });
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
    const { modules, ...rest } = app;
    const hasInteractiveNode = modules?.some((item) =>
      [FlowNodeTypeEnum.formInput, FlowNodeTypeEnum.userSelect].includes(item.flowNodeType)
    );
    return {
      ...rest,
      avatar: app.avatar ?? '',
      intro: app.intro ?? '',
      parentId: app.parentId,
      permission: Per,
      private: privateApp,
      hasInteractiveNode
    };
  });

  const list = await addSourceMember({ list: formatApps });
  return ListAppV2ResponseSchema.parse({ list, total });
}

export default NextAPI(handler);
