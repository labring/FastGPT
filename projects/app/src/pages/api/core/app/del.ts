import type { NextApiRequest, NextApiResponse } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { findAppAndAllChildren } from '@fastgpt/service/core/app/controller';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addAppDeleteJob } from '@fastgpt/service/core/app/delete';
import { deleteAppsImmediate } from '@fastgpt/service/core/app/controller';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';

async function handler(req: NextApiRequest, res: NextApiResponse<string[]>) {
  const { appId } = req.query as { appId: string };

  if (!appId) {
    return Promise.reject('参数错误');
  }

  // Auth owner (folder owner, can delete all apps in the folder)
  const { teamId, tmbId, userId, app } = await authApp({
    req,
    authToken: true,
    appId,
    per: OwnerPermissionVal
  });

  const deleteAppsList = await findAppAndAllChildren({
    teamId,
    appId
  });

  await mongoSessionRun(async (session) => {
    // Mark app as deleted
    await MongoApp.updateMany(
      { _id: deleteAppsList.map((app) => app._id), teamId },
      { deleteTime: new Date() },
      { session }
    );

    // Stop background tasks immediately
    await deleteAppsImmediate({
      teamId,
      appIds: deleteAppsList.map((app) => app._id)
    });

    // Add to delete queue for async cleanup
    await addAppDeleteJob({
      teamId,
      appId
    });
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_APP,
      params: {
        appName: app.name,
        appType: getI18nAppType(app.type)
      }
    });
  })();

  // Tracks
  pushTrack.countAppNodes({ teamId, tmbId, uid: userId, appId });

  return deleteAppsList
    .filter((app) => !['folder'].includes(app.type))
    .map((app) => String(app._id));
}

export default NextAPI(handler);
