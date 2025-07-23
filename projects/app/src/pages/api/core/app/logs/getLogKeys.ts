import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoLogKeys } from '@fastgpt/service/core/app/logs/logkeysSchema';
import type { LogKeysSchemaType } from '@fastgpt/global/core/app/logs/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

export type getLogKeysQuery = {
  appId: string;
};

export type getLogKeysBody = {};

export type getLogKeysResponse = {
  logKeys: LogKeysSchemaType['logKeys'] | null;
};

async function handler(
  req: ApiRequestProps<getLogKeysBody, getLogKeysQuery>,
  res: ApiResponseType<any>
): Promise<getLogKeysResponse> {
  const { appId } = req.query;

  const { teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  const result = await MongoLogKeys.findOne({ teamId, appId });

  return { logKeys: result?.logKeys || null };
}

export default NextAPI(handler);
