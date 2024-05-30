import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { mongoRPermission } from '@fastgpt/global/support/permission/utils';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { authUserRole } from '@fastgpt/service/support/permission/auth/user';
import { NextAPI } from '@/service/middleware/entry';
import { getCollaboratorList } from '@/web/core/app/collaborator';
import { hasRead } from '@fastgpt/service/support/permission/resourcePermission/permisson';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/resourcePermission/schema';
import { ResourceTypeEnum } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest, res: NextApiResponse<any>): Promise<AppListItemType[]> {
  // 凭证校验
  const { teamId, tmbId, teamOwner, role } = await authUserRole({ req, authToken: true });

  let appIds: string[] = [];
  if (role === 'owner') {
    // owner is not in the resource permission table.
    const apps = await MongoApp.find({ tmbId }, '_id').sort({
      updateTime: -1
    });
    appIds.push(...apps.map((app) => app._id));
  } else {
    const rp = await MongoResourcePermission.find({
      teamId,
      tmbId,
      resourceType: ResourceTypeEnum.app
    });

    appIds = rp
      .filter((item) => {
        return hasRead(item.permission);
      })
      .map((item) => {
        return item.resourceId;
      });
  }

  const myApps = await MongoApp.find(
    { _id: { $in: appIds } },
    '_id avatar name intro tmbId permission'
  ).sort({
    updateTime: -1
  });

  return myApps.map((app) => ({
    _id: app._id,
    avatar: app.avatar,
    name: app.name,
    intro: app.intro,
    isOwner: teamOwner || String(app.tmbId) === tmbId,

    // TODO: permission should be duplicated
    permission: app.permission
  }));
}

export default NextAPI(handler);
