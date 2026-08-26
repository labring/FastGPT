import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  GetAdminSystemModelListResponseSchema,
  type GetAdminSystemModelListResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { desensitizeSystemModel } from '@fastgpt/service/core/ai/config/utils';

export type listQuery = object;

export type listBody = object;

export type listResponse = GetAdminSystemModelListResponse;

async function handler(req: ApiRequestProps<listBody, listQuery>): Promise<listResponse> {
  await authSystemAdmin({ req });

  // Read db
  return GetAdminSystemModelListResponseSchema.parse(
    global.systemModelList.map(desensitizeSystemModel)
  );
}

export default NextAPI(handler);
