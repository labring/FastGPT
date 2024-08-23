import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';

export type UpdateAppVersionBody = {
  appId: string;
  versionId: string;
  versionName: string;
};

async function handler(req: ApiRequestProps<UpdateAppVersionBody>) {
  const { appId, versionId, versionName } = req.body;
  await authApp({ appId, req, per: WritePermissionVal, authToken: true });

  await MongoAppVersion.findByIdAndUpdate(
    { _id: versionId },
    {
      versionName
    }
  );

  return {};
}

export default NextAPI(handler);
