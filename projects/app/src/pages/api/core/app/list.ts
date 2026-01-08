import { MongoApp } from '@fastgpt/service/core/app/schema';
import { type AppListItemType } from '@fastgpt/global/core/app/type';
import { NextAPI } from '@/service/middleware/entry';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { sumPer } from '@fastgpt/global/support/permission/utils';

export type ListAppBody = {
  parentId?: ParentIdType;
  type?: AppTypeEnum | AppTypeEnum[];
  searchKey?: string;
};

/*
  获取 APP 列表权限
  1. 校验 folder 权限和获取 team 权限（owner 单独处理）
  2. 获取 team 下所有 app 权限。获取我的所有组。并计算出我所有的app权限。
  3. 过滤我有的权限的 app，以及当前 parentId 的 app（由于权限继承问题，这里没法一次性根据 id 去获取）
  4. 根据过滤条件获取 app 列表
  5. 遍历搜索出来的 app，并赋予权限（继承的 app，使用 parent 的权限）
  6. 再根据 read 权限进行一次过滤。
*/

async function handler(req: ApiRequestProps<ListAppBody>): Promise<AppListItemType[]> {
  const { parentId, type, searchKey } = req.body;

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
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.app,
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
  // Get my permissions
  const myPerList = roleList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

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
    '_id parentId avatar type name intro tmbId updateTime pluginData inheritPermission modules',
    {
      limit: limit
    }
  )
    .sort({
      updateTime: -1
    })
    .lean();

  // Add app permission and filter apps by read permission
  const formatApps = myApps
    .map((app) => {
      const { Per, privateApp } = (() => {
        const getPer = (appId: string) => {
          const tmbRole = myPerList.find(
            (item) => String(item.resourceId) === appId && !!item.tmbId
          )?.permission;
          const groupAndOrgRole = sumPer(
            ...myPerList
              .filter(
                (item) => String(item.resourceId) === appId && (!!item.groupId || !!item.orgId)
              )
              .map((item) => item.permission)
          );

          return new AppPermission({
            role: tmbRole ?? groupAndOrgRole,
            isOwner: String(app.tmbId) === String(tmbId) || teamPer.isOwner
          });
        };

        const getClbCount = (appId: string) => {
          return roleList.filter((item) => String(item.resourceId) === String(appId)).length;
        };

        // Inherit app, check parent folder clb and it's own clb
        if (!AppFolderTypeList.includes(app.type) && app.parentId && app.inheritPermission) {
          return {
            Per: getPer(String(app.parentId)).addRole(getPer(String(app._id)).role),
            privateApp: getClbCount(String(app.parentId)) <= 1
          };
        }

        return {
          Per: getPer(String(app._id)),
          privateApp: getClbCount(String(app._id)) <= 1
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
    })
    .filter((app) => app.permission.hasReadPer);

  return addSourceMember({
    list: formatApps
  });
}

export default NextAPI(handler);
