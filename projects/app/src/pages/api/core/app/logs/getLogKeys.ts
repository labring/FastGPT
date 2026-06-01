import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppLogKeys } from '@fastgpt/service/core/app/logs/logkeysSchema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import {
  GetLogKeysQuerySchema,
  GetLogKeysResponseSchema,
  type getLogKeysResponseType
} from '@fastgpt/global/openapi/core/app/log/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps): Promise<getLogKeysResponseType> {
  const {
    query: { appId }
  } = parseApiInput({
    req,
    querySchema: GetLogKeysQuerySchema
  });

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
