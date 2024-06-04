import type { NextApiRequest, NextApiResponse } from 'next';
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

async function handler(req: NextApiRequest, res: NextApiResponse<any>): Promise<AppListItemType[]> {
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

  /* temp: get all apps and per */
  const [myApps, rpList] = await Promise.all([
    MongoApp.find({ teamId }, '_id avatar name intro tmbId defaultPermission')
      .sort({
        updateTime: -1
      })
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

  return filterApps.map((app) => ({
    _id: app._id,
    avatar: app.avatar,
    name: app.name,
    intro: app.intro,
    permission: app.permission,
    defaultPermission: app.defaultPermission
  }));
}

export default NextAPI(handler);
