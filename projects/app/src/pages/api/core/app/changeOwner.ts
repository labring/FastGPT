import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { MongoApp } from '@fastgpt/service/core/app/schema';

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

  const newOwner = await MongoTeamMember.findById(ownerId);

  if (!newOwner || String(newOwner.teamId) !== String(app.teamId)) {
    return Promise.reject(AppErrEnum.invalidOwner);
  }

  return await MongoApp.updateOne({ _id: appId }, { ownerId });
}

export default NextAPI(handler);
