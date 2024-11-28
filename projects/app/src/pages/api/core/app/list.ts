import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { NextAPI } from '@/service/middleware/entry';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppDefaultPermissionVal } from '@fastgpt/global/support/permission/app/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupPer } from '@fastgpt/service/support/permission/controller';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';

export type ListAppBody = {
  parentId?: ParentIdType;
  type?: AppTypeEnum | AppTypeEnum[];
  getRecentlyChat?: boolean;
  searchKey?: string;
};

async function handler(req: ApiRequestProps<ListAppBody>): Promise<AppListItemType[]> {
  const { parentId, type, getRecentlyChat, searchKey } = req.body;

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
  const [perList, myGroupMap] = await Promise.all([
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
    })
  ]);
  // Get my permissions
  const myPerList = perList.filter(
    (item) => String(item.tmbId) === String(tmbId) || myGroupMap.has(String(item.groupId))
  );

  const findAppsQuery = (() => {
    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
          ]
        }
      : {};
    // Filter apps by permission, if not owner, only get apps that I have permission to access
    const appIdQuery = teamPer.isOwner
      ? {}
      : { _id: { $in: myPerList.map((item) => item.resourceId) } };

    if (getRecentlyChat) {
      return {
        // get all chat app
        ...appIdQuery,
        teamId,
        type: { $in: [AppTypeEnum.workflow, AppTypeEnum.simple, AppTypeEnum.plugin] },
        ...searchMatch
      };
    }

    if (searchKey) {
      return {
        ...appIdQuery,
        teamId,
        ...searchMatch
      };
    }

    return {
      ...appIdQuery,
      teamId,
      ...(type && (Array.isArray(type) ? { type: { $in: type } } : { type })),
      ...parseParentIdInMongo(parentId)
    };
  })();
  const limit = (() => {
    if (getRecentlyChat) return 15;
    if (searchKey) return 20;
    return 1000;
  })();

  const myApps = await MongoApp.find(
    findAppsQuery,
    '_id parentId avatar type name intro tmbId updateTime pluginData inheritPermission'
  )
    .sort({
      updateTime: -1
    })
    .limit(limit)
    .lean();

  // Add app permission and filter apps by read permission
  const formatApps = myApps
    .map((app) => {
      const { Per, privateApp } = (() => {
        const getPer = (appId: string) => {
          const tmbPer = myPerList.find(
            (item) => String(item.resourceId) === appId && !!item.tmbId
          )?.permission;
          const groupPer = getGroupPer(
            myPerList
              .filter((item) => String(item.resourceId) === appId && !!item.groupId)
              .map((item) => item.permission)
          );

          // Count app collaborators
          const clbCount = perList.filter((item) => String(item.resourceId) === appId).length;

          return {
            Per: new AppPermission({
              per: tmbPer ?? groupPer ?? AppDefaultPermissionVal,
              isOwner: String(app.tmbId) === String(tmbId) || teamPer.isOwner
            }),
            privateApp: AppFolderTypeList.includes(app.type) ? clbCount <= 1 : clbCount === 0
          };
        };

        // Inherit app
        if (app.inheritPermission && parentId && !AppFolderTypeList.includes(app.type)) {
          return getPer(String(parentId));
        } else {
          return getPer(String(app._id));
        }
      })();

      return {
        ...app,
        permission: Per,
        privateApp
      };
    })
    .filter((app) => app.permission.hasReadPer);

  return formatApps.map((app) => ({
    _id: app._id,
    tmbId: app.tmbId,
    avatar: app.avatar,
    type: app.type,
    name: app.name,
    intro: app.intro,
    updateTime: app.updateTime,
    permission: app.permission,
    pluginData: app.pluginData,
    inheritPermission: app.inheritPermission ?? true,
    private: app.privateApp
  }));
}

export default NextAPI(handler);
