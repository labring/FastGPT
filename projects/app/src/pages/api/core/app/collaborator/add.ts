import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import {
  constructPermission,
  hasManage
} from '@fastgpt/service/support/permission/resourcePermission/permisson';
import {
  AppDefaultPermission,
  AppPermissionList
} from '@fastgpt/service/support/permission/app/permission';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/resourcePermission/schema';
import { ResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';

export type AddAppCollaboratorRequest = {
  appId: string;
  tmbIds: string[];
  permission?: PermissionValueType;
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    // Authorization
    const { appId, tmbIds } = req.body as AddAppCollaboratorRequest;

    const permission = Number(req.body.permission as string);
    const { teamId, isOwner } = await authApp({
      req,
      authToken: true,
      appId,
      per: constructPermission([AppPermissionList['Read'], AppPermissionList['Manage']]).value
    });

    if (hasManage(permission)) {
      // only owner could grant manage permission
      if (!isOwner) {
        throw new Error('Only owner could grant manage permission');
      }
    }

    // if (
    //   !(await MongoTeamMember.find({
    //     teamId,
    //     _id: tmbIds
    //   }))
    // ) {
    //   throw new Error('The user is not in the team');
    // }
    const update = tmbIds.map((tmbId) => {
      return MongoResourcePermission.updateOne(
        {
          resourceId: appId,
          resourceType: ResourceTypeEnum.app,
          teamId,
          tmbId
        },
        {
          permission
        },
        {
          upsert: true
        }
      );
    });
    await Promise.all(update);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error });
  }
}

export default NextAPI(handler);
