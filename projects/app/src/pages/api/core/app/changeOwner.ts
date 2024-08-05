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
import { findAppAndAllChildren } from '@fastgpt/service/core/app/controller';

export type AppChangeOwnerQuery = {};
export type AppChangeOwnerBody = {
  ownerId: string;
  appId: string;
};
export type AppChangeOwnerResponse = {};

async function handler(
  req: ApiRequestProps<AppChangeOwnerBody, AppChangeOwnerQuery>,
  _res: ApiResponseType<any>
): Promise<AppChangeOwnerResponse> {
  const { ownerId, appId } = req.body;

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

    const apps = (
      await findAppAndAllChildren({
        teamId: app.teamId,
        appId
      })
    ).filter((app) => String(app.tmbId) === oldOwnerId);

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
  });

  return {};
}

export default NextAPI(handler);
