import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { AppAdminPermission } from '@fastgpt/service/support/permission/app/permission';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/resourcePermission/schema';
import { ResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { AppCollaboratorType } from '@fastgpt/global/core/app/type';

async function handler(req: NextApiRequest) {
  // Authorization
  const { appId } = req.query as { appId: string };
  await authApp({
    req,
    authToken: true,
    appId,
    per: AppAdminPermission.value
  });

  return (
    await MongoResourcePermission.find({
      resourceId: appId,
      resourceType: ResourceTypeEnum.app
    })
  ).map((item) => {
    return <AppCollaboratorType>{
      appId: item.resourceId,
      tmbId: item.tmbId,
      teamId: item.teamId,
      permission: item.permission
    };
  });
}

export default NextAPI(handler);
