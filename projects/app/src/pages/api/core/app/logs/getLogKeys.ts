import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppLogKeys } from '@fastgpt/service/core/app/logs/logkeysSchema';
import type { AppLogKeysSchemaType } from '@fastgpt/global/core/app/logs/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';

export type getLogKeysQuery = {
  appId: string;
};

export type getLogKeysBody = {};

export type getLogKeysResponse = {
  logKeys: AppLogKeysSchemaType['logKeys'];
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
    per: AppReadChatLogPerVal
  });

  const result = await MongoAppLogKeys.findOne({ teamId, appId });

  return { logKeys: result?.logKeys || [] };
}

export default NextAPI(handler);
