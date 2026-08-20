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
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { isInteractiveNodeType } from '@fastgpt/global/core/workflow/node/constant';
import { isPrivateResourceByCollaborators, sumPer } from '@fastgpt/global/support/permission/utils';
import { getResourcePermissionsByTeam } from '@fastgpt/service/support/permission/resourcePermissionService';
import { Types } from '@fastgpt/service/common/mongo';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ListAppBodySchema,
  ListAppResponseSchema,
  type ListAppBodyType,
  type ListAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';

/*
  获取 APP 列表权限
  1. 校验 folder 权限和获取 team 权限（owner 单独处理）
  2. 获取 team 下所有 app 权限。获取我的所有组。并计算出我所有的app权限。
  3. 过滤我有权限的 app，并按 parentId 过滤目录层级
  4. 根据过滤条件获取 app 列表
  5. 遍历搜索出来的 app，并赋予资源自身 ACL 对应的权限
  6. 再根据 read 权限进行一次过滤。
*/

async function handler(req: ApiRequestProps<ListAppBodyType>): Promise<ListAppResponseType> {
  const { parentId, type, searchKey } = parseApiInput({
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

  // Get team all app permissions
  const [roleList, myGroupMap, myOrgSet] = await Promise.all([
    getResourcePermissionsByTeam({
      resourceType: PerResourceTypeEnum.app,
      teamId
    }),
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
  const roleListMap = new Map<string, (typeof roleList)[number][]>();
  roleList.forEach((item) => {
    const resourceId = String(item.resourceId);
    const list = roleListMap.get(resourceId) ?? [];
    list.push(item);
    roleListMap.set(resourceId, list);
  });
  // Get my permissions
  const myPerList = roleList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );
  const myPerListMap = new Map<string, (typeof myPerList)[number][]>();
  myPerList.forEach((item) => {
    const resourceId = String(item.resourceId);
    const list = myPerListMap.get(resourceId) ?? [];
    list.push(item);
    myPerListMap.set(resourceId, list);
  });

  const findAppsQuery = (() => {
    // Filter apps by permission, if not owner, only get apps that I have permission to access
    const idList = { _id: { $in: myPerList.map((item) => item.resourceId) } };
    const appPerQuery = teamPer.isOwner
      ? {
          parentId: parentId ? parseParentIdInMongo(parentId) : null
        }
      : parentId
        ? {
            $or: [idList, parseParentIdInMongo(parentId)]
          }
        : { $or: [idList, { parentId: null }] };

    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
          ]
        }
      : {};

    const _type = (() => {
      if (type) {
        // 如果明确指定了类型，则按指定类型查询（包括 hidden）
        return Array.isArray(type) ? { $in: type } : type;
      }
      // 如果没有指定类型，则排除 hidden 类型
      return { $ne: AppTypeEnum.hidden } as const;
    })();

    if (searchKey) {
      const data = {
        ...appPerQuery,
        teamId,
        ...searchMatch,
        type: _type
      };

      // @ts-ignore
      delete data.parentId;
      return data;
    }

    return {
      ...appPerQuery,
      teamId,
      type: _type,
      ...parseParentIdInMongo(parentId)
    };
  })();
  const limit = (() => {
    if (searchKey) return 50;
    return;
  })();

  const myApps = await MongoApp.find(
    { ...findAppsQuery, deleteTime: null },
    '_id parentId avatar type name intro tmbId updateTime pluginData inheritPermission publishedVersionId',
    {
      limit: limit
    }
  )
    .sort({
      updateTime: -1
    })
    .lean();

  /**
   * 评测选应用会过滤含表单输入 / 用户选择节点的工作流。
   * 只扫当前 publishedVersionId 对应 Version 的 nodes，不读 App.modules。
   */
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

  const interactiveAppIds = await getInteractiveAppIdSet();

  // Add app permission and filter apps by read permission
  const formatApps = myApps
    .map((app) => {
      const { Per, privateApp } = (() => {
        const getPer = (appId: string) => {
          // 权限已按资源预分组，避免列表中每个 App 都重新扫描团队全部 ACL。
          const appPerList = myPerListMap.get(appId) ?? [];
          const tmbRole = appPerList.find((item) => !!item.tmbId)?.permission;
          const groupAndOrgRole = sumPer(
            ...appPerList
              .filter((item) => !!item.groupId || !!item.orgId)
              .map((item) => item.permission)
          );

          return new AppPermission({
            role: tmbRole ?? groupAndOrgRole,
            isOwner: String(app.tmbId) === String(tmbId) || teamPer.isOwner
          });
        };

        const resourceClbs = roleListMap.get(String(app._id)) ?? [];

        return {
          Per: getPer(String(app._id)),
          privateApp: isPrivateResourceByCollaborators({
            resourceClbs
          })
        };
      })();

      const { publishedVersionId: _publishedVersionId, ...rest } = app;

      return {
        ...rest,
        avatar: app.avatar ?? '',
        intro: app.intro ?? '',
        parentId: app.parentId,
        permission: Per,
        private: privateApp,
        hasInteractiveNode: interactiveAppIds.has(String(app._id))
      };
    })
    .filter((app) => app.permission.hasReadPer);

  const list = await addSourceMember({
    list: formatApps
  });

  return ListAppResponseSchema.parse(list);
}

export default NextAPI(handler);
