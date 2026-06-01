import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppLogKeys } from '@fastgpt/service/core/app/logs/logkeysSchema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import {
  UpdateLogKeysBodySchema,
  UpdateLogKeysResponseSchema,
  type updateLogKeysResponseType
} from '@fastgpt/global/openapi/core/app/log/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps): Promise<updateLogKeysResponseType> {
  const {
    body: { appId, logKeys }
  } = parseApiInput({
    req,
    bodySchema: UpdateLogKeysBodySchema
  });

  const { teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  await MongoAppLogKeys.findOneAndUpdate({ teamId, appId }, { logKeys }, { upsert: true });

  return UpdateLogKeysResponseSchema.parse(undefined);
}

export default NextAPI(handler);
