import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppLogKeys } from '@fastgpt/service/core/app/logs/logkeysSchema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import {
  GetLogKeysQuerySchema,
  GetLogKeysResponseSchema,
  type getLogKeysResponseType
} from '@fastgpt/global/openapi/core/app/log/api';

export type getLogKeysQuery = {};

export type getLogKeysBody = {};

async function handler(
  req: ApiRequestProps,
  res: ApiResponseType<any>
): Promise<getLogKeysResponseType> {
  const { appId } = GetLogKeysQuerySchema.parse(req.query);

  const { teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: AppReadChatLogPerVal
  });

  const result = await MongoAppLogKeys.findOne({ teamId, appId });

  return GetLogKeysResponseSchema.parse({ logKeys: result?.logKeys || [] });
}

export default NextAPI(handler);
