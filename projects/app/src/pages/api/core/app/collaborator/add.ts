import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { constructPermission } from '@fastgpt/service/support/permission/resourcePermission/permisson';
import {
  AppDefaultPermission,
  AppPermissionList
} from '@fastgpt/service/support/permission/app/permission';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/resourcePermission/schema';
import { ResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  // Authorization
  const { appId, tmbId } = req.query as {
    appId: string;
    tmbId: string;
    permission?: string;
  };

  const permission = Number(req.query.permission as string);

  const { teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: constructPermission([AppPermissionList['Read'], AppPermissionList['Manage']]).value
  });

  if (
    !(await MongoTeamMember.findOne({
      teamId,
      _id: tmbId
    }))
  ) {
    throw new Error('The user is not in the team');
  }

  return await MongoResourcePermission.create({
    resourceId: appId,
    resourceType: ResourceTypeEnum.app,
    tmbId,
    teamId,
    permission
  });
}

export default NextAPI(handler);
