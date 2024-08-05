import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import {
  ManagePermissionVal,
  OwnerPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { postUpdateAppCollaborators } from '@/web/core/app/api/collaborator';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { findAppAndAllChildren } from '@fastgpt/service/core/app/controller';

export type AppChangeOwnerQuery = {};
export type AppChangeOwnerBody = {
  ownerId: string;
  appId: string;
  recurisve?: boolean;
};
export type AppChangeOwnerResponse = {};

async function handler(
  req: ApiRequestProps<AppChangeOwnerBody, AppChangeOwnerQuery>,
  _res: ApiResponseType<any>
): Promise<AppChangeOwnerResponse> {
  const { ownerId, appId, recurisve } = req.body;

  const { app } = await authApp({
    req,
    appId,
    authToken: true,
    per: OwnerPermissionVal
  });

  const oldOwnerId = app.tmbId;
  const newOwner = await MongoTeamMember.findById(ownerId);

  if (!newOwner || String(newOwner.teamId) !== String(app.teamId)) {
    return Promise.reject(AppErrEnum.invalidOwner);
  }

  await mongoSessionRun(async (session) => {
    await MongoApp.updateOne(
      { _id: appId },
      { tmbId: ownerId, inheritPermission: false },
      { session }
    );

    await postUpdateAppCollaborators({
      appId,
      tmbIds: [ownerId],
      permission: ManagePermissionVal
    });

    if (recurisve && AppFolderTypeList.includes(app.type)) {
      return Promise.reject(AppErrEnum.invalidAppType);
    }

    if (recurisve) {
      // 1. get all sub apps
      const apps = await (async () => {
        const allApps = await findAppAndAllChildren({
          teamId: app.teamId,
          appId
        });

        const queue = [appId];
        const apps = [];

        while (queue.length) {
          const curAppId = queue.shift();
          const curApp = allApps.find((app) => String(app._id) === curAppId);
          const children = allApps.filter(
            (app) => String(app.parentId) === curAppId && String(app.tmbId) === oldOwnerId
          );
          if (curApp) {
            apps.push(curApp);
            queue.push(...children.map((app) => String(app._id)));
          }
        }

        return apps;
      })();

      console.debug(apps.map((app) => app._id));

      for (const app of apps) {
        await MongoApp.updateOne({ _id: app._id }, { tmbId: ownerId }, { session });

        if (app.inheritPermission === false) {
          postUpdateAppCollaborators({
            appId: app._id,
            tmbIds: [oldOwnerId],
            permission: ManagePermissionVal
          });
        }
      }
    }
    return {};
  });

  return {};
}

export default NextAPI(handler);
