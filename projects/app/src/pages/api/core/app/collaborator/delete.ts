import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { AppPermissionList } from '@fastgpt/service/support/permission/app/permission';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/resourcePermission/schema';
import { ResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { hasManage } from '@fastgpt/service/support/permission/resourcePermission/permisson';
export type AppCollaboratorDeleteParams = {
  appId: string;
  tmbId: string;
};
async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    // Authorization
    const { appId, tmbId } = req.query as AppCollaboratorDeleteParams;

    const { isOwner } = await authApp({
      req,
      authToken: true,
      appId,
      per: AppPermissionList['Manage']
    });

    const rp = await MongoResourcePermission.findOne({
      resourceId: appId,
      resourceType: ResourceTypeEnum.app,
      tmbId: tmbId
    });

    if (!rp) {
      throw new Error('Not Collaborator!');
    }

    if (hasManage(rp.permission) && !isOwner) {
      throw new Error('You can not delete a manager!');
    }

    return await MongoResourcePermission.deleteOne({
      tmbId,
      resourceType: ResourceTypeEnum.app,
      resourceId: appId
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error });
  }
}

export default NextAPI(handler);
