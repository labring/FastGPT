import type { NextApiResponse } from 'next';
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
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppDefaultPermissionVal } from '@fastgpt/global/support/permission/app/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

export type ListAppBody = {
  parentId?: ParentIdType;
  type?: AppTypeEnum | AppTypeEnum[];
  getRecentlyChat?: boolean;
  searchKey?: string;
};

async function handler(
  req: ApiRequestProps<ListAppBody>,
  res: NextApiResponse<any>
): Promise<AppListItemType[]> {
  const { parentId, type, getRecentlyChat, searchKey } = req.body;

  // 凭证校验
  let ParentApp, tmbId, teamId, tmbPer;

  if (parentId) {
    const result = await authApp({
      req,
      authToken: true,
      appId: parentId,
      per: ReadPermissionVal
    });
    ParentApp = result.app;
    tmbId = result.tmbId;
    teamId = result.teamId;
    tmbPer = result.permission;
  } else {
    const result = await authUserPer({
      req,
      authToken: true,
      per: ReadPermissionVal
    });

    tmbId = result.tmbId;
    teamId = result.teamId;
    tmbPer = result.permission;
  }
  const findAppsQuery = (() => {
    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: searchKey, $options: 'i' } },
            { intro: { $regex: searchKey, $options: 'i' } }
          ]
        }
      : {};

    if (getRecentlyChat) {
      return {
        // get all chat app
        teamId,
        type: { $in: [AppTypeEnum.workflow, AppTypeEnum.simple] },
        ...searchMatch
      };
    }

    return {
      teamId,
      ...(type && Array.isArray(type) && { type: { $in: type } }),
      ...(type && { type }),
      ...parseParentIdInMongo(parentId),
      ...searchMatch
    };
  })();

  /* temp: get all apps and per */
  const [myApps, rpList] = await Promise.all([
    MongoApp.find(
      findAppsQuery,
      '_id parentId avatar type name intro tmbId updateTime pluginData defaultPermission inheritPermission'
    )
      .sort({
        updateTime: -1
      })
      .limit(searchKey ? 20 : 1000)
      .lean(),
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.app,
      teamId,
      tmbId
    }).lean()
  ]);

  const appFolderTypes = [AppTypeEnum.folder, AppTypeEnum.httpPlugin];

  const filterApps = myApps
    .map((app) => {
      let Per: AppPermission;
      if (app.inheritPermission && app.parentId && !appFolderTypes.includes(app.type)) {
        // get its parent's permission as its permission
        app.defaultPermission = ParentApp!.defaultPermission;
        const perVal = rpList.find(
          (item) => String(item.resourceId) === String(ParentApp!._id)
        )?.permission;

        Per = new AppPermission({
          per: perVal ?? app.defaultPermission,
          isOwner: String(app.tmbId) === tmbId || tmbPer.isOwner
        });
      } else {
        const perVal = rpList.find(
          (item) => String(item.resourceId) === String(app._id)
        )?.permission;
        Per = new AppPermission({
          per: perVal ?? app.defaultPermission,
          isOwner: String(app.tmbId) === tmbId || tmbPer.isOwner
        });
      }

      return {
        ...app,
        permission: Per
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
    defaultPermission: app.defaultPermission || AppDefaultPermissionVal,
    pluginData: app.pluginData,
    inheritPermission: app.inheritPermission ?? true
  }));
}

export default NextAPI(handler);
