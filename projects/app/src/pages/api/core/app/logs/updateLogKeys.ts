import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { AppLogKeysEnum } from '@fastgpt/global/core/app/logs/constants';
import { MongoAppLogKeys } from '@fastgpt/service/core/app/logs/logkeysSchema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';

export type updateLogKeysQuery = {};

export type updateLogKeysBody = {
  appId: string;
  logKeys: { key: AppLogKeysEnum; enable: boolean }[];
};

export type updateLogKeysResponse = {};

async function handler(
  req: ApiRequestProps<updateLogKeysBody, updateLogKeysQuery>,
  res: ApiResponseType<any>
): Promise<updateLogKeysResponse> {
  const { appId, logKeys } = req.body;
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
