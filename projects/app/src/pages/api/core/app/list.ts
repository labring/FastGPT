import type { NextApiResponse } from 'next';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
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
  // 凭证校验
  const {
    teamId,
    tmbId,
    permission: tmbPer
  } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });

  const { parentId, type, getRecentlyChat, searchKey } = req.body;

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
      '_id avatar type name intro tmbId updateTime pluginData defaultPermission'
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

  const filterApps = myApps
    .map((app) => {
      const perVal = rpList.find((item) => String(item.resourceId) === String(app._id))?.permission;
      const Per = new AppPermission({
        per: perVal ?? app.defaultPermission,
        isOwner: String(app.tmbId) === tmbId || tmbPer.isOwner
      });

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
    pluginData: app.pluginData
  }));
}

export default NextAPI(handler);
