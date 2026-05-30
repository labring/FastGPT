import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  GetAppPermissionQuerySchema,
  GetAppPermissionResponseSchema,
  type GetAppPermissionResponseType
} from '@fastgpt/global/openapi/core/app/permission/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

/* Get app permission */
async function handler(req: ApiRequestProps): Promise<GetAppPermissionResponseType> {
  const { appId } = parseApiInput({
    req,
    querySchema: GetAppPermissionQuerySchema
  }).query;

  // Auth app permission
  try {
    const { app } = await authApp({
      req,
      authToken: true,
      appId,
      per: ReadPermissionVal
    });

    return GetAppPermissionResponseSchema.parse({
      hasReadPer: app.permission.hasReadPer,
      hasWritePer: app.permission.hasWritePer,
      hasManagePer: app.permission.hasManagePer,
      hasReadChatLogPer: app.permission.hasReadChatLogPer,
      isOwner: app.permission.isOwner
    });
  } catch {
    return GetAppPermissionResponseSchema.parse({
      hasReadPer: false,
      hasWritePer: false,
      hasManagePer: false,
      hasReadChatLogPer: false,
      isOwner: false
    });
  }
}

export default NextAPI(handler);
