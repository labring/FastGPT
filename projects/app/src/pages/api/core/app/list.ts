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

  // 凭证校验
  const {
    app: ParentApp,
    tmbId,
    teamId,
    permission: myPer
  } = await (async () => {
    if (parentId) {
      return await authApp({
        req,
        authToken: true,
        appId: parentId,
        per: ReadPermissionVal
      });
    } else {
      return {
        ...(await authUserPer({
          req,
          authToken: true,
          per: ReadPermissionVal
        })),
        app: undefined
      };
    }
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

    if (getRecentlyChat) {
      return {
        // get all chat app
        teamId,
        type: { $in: [AppTypeEnum.workflow, AppTypeEnum.simple, AppTypeEnum.plugin] },
        ...searchMatch
      };
    }

    if (searchKey) {
      return {
        teamId,
        ...searchMatch
      };
    }

    return {
      teamId,
      ...(type && Array.isArray(type) && { type: { $in: type } }),
      ...(type && { type }),
      ...parseParentIdInMongo(parentId)
    };
  })();

  /* temp: get all apps and per */
  const myGroupIds = (
    await getGroupsByTmbId({
      tmbId,
      teamId
    })
  ).map((item) => String(item._id));

  const [myApps, perList] = await Promise.all([
    MongoApp.find(
      findAppsQuery,
      '_id parentId avatar type name intro tmbId updateTime pluginData inheritPermission'
    )
      .sort({
        updateTime: -1
      })
      .limit(searchKey ? 20 : 1000)
      .lean(),
    MongoResourcePermission.find({
      $and: [
        {
          resourceType: PerResourceTypeEnum.app,
          teamId
        },
        { $or: [{ tmbId }, { groupId: { $in: myGroupIds } }] }
      ]
    }).lean()
  ]);

  const filterApps = myApps
    .map((app) => {
      const { Per, privateApp } = (() => {
        // Inherit app
        if (app.inheritPermission && ParentApp && !AppFolderTypeList.includes(app.type)) {
          const tmbPer = perList.find(
            (item) => String(item.resourceId) === String(ParentApp._id) && !!item.tmbId
          )?.permission;
          const groupPer = getGroupPer(
            perList
              .filter(
                (item) =>
                  String(item.resourceId) === String(ParentApp._id) &&
                  myGroupIds.includes(String(item.groupId))
              )
              .map((item) => item.permission)
          );

          return {
            Per: new AppPermission({
              per: tmbPer ?? groupPer ?? AppDefaultPermissionVal,
              isOwner: String(app.tmbId) === String(tmbId) || myPer.isOwner
            }),
            privateApp: !tmbPer && !groupPer
          };
        } else {
          const tmbPer = perList.find(
            (item) => String(item.resourceId) === String(app._id) && !!item.tmbId
          )?.permission;
          const group = perList.filter(
            (item) =>
              String(item.resourceId) === String(app._id) &&
              myGroupIds.includes(String(item.groupId))
          );
          const groupPer = getGroupPer(group.map((item) => item.permission));
          return {
            Per: new AppPermission({
              per: tmbPer ?? groupPer ?? AppDefaultPermissionVal,
              isOwner: String(app.tmbId) === String(tmbId) || myPer.isOwner
            }),
            privateApp: !tmbPer && !groupPer
          };
        }
      })();
      return {
        ...app,
        permission: Per,
        privateApp
      };
    })
    .filter((app) => app.permission.hasReadPer);

  const sliceApps = getRecentlyChat ? filterApps.slice(0, 15) : filterApps;

  return sliceApps.map((app) => ({
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
