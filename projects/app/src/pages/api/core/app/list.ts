import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { authUserRole } from '@fastgpt/service/support/permission/auth/user';
import { NextAPI } from '@/service/middleware/entry';
import { hasRead } from '@fastgpt/service/support/permission/resourcePermission/permisson';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/resourcePermission/schema';
import { ResourceTypeEnum } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest, res: NextApiResponse<any>): Promise<AppListItemType[]> {
  // 凭证校验
  const { teamId, tmbId, teamOwner } = await authUserRole({ req, authToken: true });

  let [myApps, rp] = await Promise.all([
    MongoApp.find({ teamId }, '_id avatar name intro tmbId permission defaultPermission').sort({
      updateTime: -1
    }),
    MongoResourcePermission.find({
      teamId,
      tmbId,
      resourceType: ResourceTypeEnum.app
    })
  ]);

  myApps = myApps.filter((app) => {
    const permission = rp.find(
      (item) => item.resourceId.toString() === app._id.toString()
    )?.permission;
    if (app.tmbId.toString() === tmbId.toString()) {
      // owner
      return true;
    }

    if (permission && hasRead(permission)) {
      // has permission to read the app
      return true;
    }

    if (hasRead(app.defaultPermission) && !permission) {
      // defaultPermission is readable and the permission is not configured
      return true;
    }
    // otherwise, the app is not readable
    return false;
  });

  return myApps.map((app) => ({
    _id: app._id,
    avatar: app.avatar,
    name: app.name,
    intro: app.intro,
    isOwner: teamOwner || String(app.tmbId) === tmbId,
    permission: app.permission,
    defaultPermission: app.defaultPermission
  }));
}

export default NextAPI(handler);
