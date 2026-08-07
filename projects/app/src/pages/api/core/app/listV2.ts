import { MongoApp } from '@fastgpt/service/core/app/schema';
import { NextAPI } from '@/service/middleware/entry';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { isPrivateResourceByCollaborators, sumPer } from '@fastgpt/global/support/permission/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { parseV2Pagination } from '@fastgpt/service/common/api/paginationV2';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import {
  getMyResourcePermission,
  buildReadableMatch,
  mergeMongoAndQuery,
  addSourceMemberV2,
  READABLE_IDS_LIMIT
} from '@fastgpt/service/support/permission/resource/readable';
import {
  ListAppV2BodySchema,
  ListAppV2ResponseSchema,
  type ListAppV2BodyType,
  type ListAppV2ResponseType
} from '@fastgpt/global/openapi/core/app/common/api';

/*
  获取 APP 列表（分页版）
  1. 校验 folder 权限和获取 team 权限（owner 单独处理）
  2. getMyResourcePermission 计算直接可读集合（readableDirectIds）
  3. owner → perMatch={}；非 owner → buildReadableMatch 三分支精确谓词
  4. match 逐模式：searchKey 无顶层 parentId（全局搜索）；显式 parentId 时 AND 目录条件
  5. find 与 countDocuments 同一 match 常量 + 同一 readFromSecondary，skip/limit 下推
  6. 页内 Per/private/hasInteractiveNode 计算 + sourceMember 页内占位
*/

async function handler(req: ApiRequestProps<ListAppV2BodyType>): Promise<ListAppV2ResponseType> {
  const {
    parentId,
    type,
    searchKey,
    pageSize: rawPageSize,
    offset: rawOffset,
    pageNum: rawPageNum
  } = parseApiInput({
    req,
    bodySchema: ListAppV2BodySchema
  }).body;
  const { pageSize, offset } = parseV2Pagination({
    pageSize: rawPageSize,
    offset: rawOffset,
    pageNum: rawPageNum
  });

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

  const { myPerList, roleListMap, readableDirectIds } = await getMyResourcePermission({
    teamId,
    tmbId,
    resourceType: PerResourceTypeEnum.app,
    createPermission: (role) => new AppPermission({ role })
  });

  // 可读集合过大时拒绝请求（$in 数组过大会让查询与计数失控）
  if (!teamPer.isOwner && readableDirectIds.length > READABLE_IDS_LIMIT) {
    return Promise.reject(CommonErrEnum.tooManyReadableResources);
  }

  const perMatch = teamPer.isOwner
    ? {}
    : buildReadableMatch({
        readableDirectIds,
        tmbId,
        folderTypeList: AppFolderTypeList
      });

  const typeCond = (() => {
    if (type) {
      // 显式指定类型时按指定类型查询（包括 hidden）
      return Array.isArray(type) ? { type: { $in: type } } : { type };
    }
    // 未指定时排除 hidden 类型
    return { type: { $ne: AppTypeEnum.hidden } } as const;
  })();

  const searchMatch = searchKey
    ? {
        $or: [
          { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
          { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
        ]
      }
    : {};

  // 逐模式 match：searchKey 全局搜索（无顶层 parentId）；否则显式 parentId（undefined 时为空对象被合并忽略）
  const match = mergeMongoAndQuery(
    { teamId, deleteTime: null },
    typeCond,
    perMatch,
    searchKey ? searchMatch : parseParentIdInMongo(parentId)
  );

  const [myApps, total] = await Promise.all([
    MongoApp.find(
      match,
      '_id parentId avatar type name intro tmbId updateTime pluginData inheritPermission modules',
      { ...readFromSecondary }
    )
      .sort({ updateTime: -1, _id: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoApp.countDocuments(match, { ...readFromSecondary })
  ]);

  // 页内后处理：Per/private（myPerList 计算角色 + roleListMap 计算协作方）+ hasInteractiveNode（modules）
  const formatApps = myApps.map((app) => {
    const { Per, privateApp } = (() => {
      const getPer = (appId: string) => {
        const myRecords = myPerList.filter((item) => String(item.resourceId) === appId);
        const tmbRole = myRecords.find((item) => !!item.tmbId)?.permission;
        const groupAndOrgRole = sumPer(
          ...myRecords
            .filter((item) => !!item.groupId || !!item.orgId)
            .map((item) => item.permission)
        );

        return new AppPermission({
          role: tmbRole ?? groupAndOrgRole,
          isOwner: String(app.tmbId) === String(tmbId) || teamPer.isOwner
        });
      };

      // Inherit app, check parent folder clb and it's own clb
      if (!AppFolderTypeList.includes(app.type) && app.parentId && app.inheritPermission) {
        const resourceClbs = roleListMap.get(String(app._id)) ?? [];
        const parentClbs = roleListMap.get(String(app.parentId)) ?? [];

        return {
          Per: getPer(String(app.parentId)).addRole(getPer(String(app._id)).role),
          privateApp: isPrivateResourceByCollaborators({
            resourceClbs,
            parentClbs,
            inheritPermission: true
          })
        };
      }

      const resourceClbs = roleListMap.get(String(app._id)) ?? [];

      return {
        Per: getPer(String(app._id)),
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
      parentId: app.parentId,
      permission: Per,
      private: privateApp,
      hasInteractiveNode
    };
  });

  // 谓词等价性防御：命中谓词外资源说明权限谓词回归，仅告警不改结果
  const invalidApp = formatApps.find((app) => !app.permission.hasReadPer);
  if (invalidApp) {
    console.warn('[listV2] app 命中权限谓词外资源（谓词回归？）', invalidApp._id);
  }

  const list = await addSourceMemberV2({
    list: formatApps
  });

  return ListAppV2ResponseSchema.parse({ list, total });
}

export default NextAPI(handler);
