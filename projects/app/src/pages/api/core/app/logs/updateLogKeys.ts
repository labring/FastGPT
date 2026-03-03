import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppLogKeys } from '@fastgpt/service/core/app/logs/logkeysSchema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { UpdateLogKeysBodySchema } from '@fastgpt/global/openapi/core/app/log/api';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>): Promise<{}> {
  const { appId, logKeys } = UpdateLogKeysBodySchema.parse(req.body);

  const { teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  await MongoAppLogKeys.findOneAndUpdate({ teamId, appId }, { logKeys }, { upsert: true });

  return {};
}

export default NextAPI(handler);
