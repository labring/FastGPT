import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { getSystemModelConfig } from '@fastgpt/service/core/ai/config/utils';
import {
  AdminSystemModelReferenceSchema,
  GetAdminSystemModelDefaultConfigResponseSchema,
  type AdminSystemModelReference,
  type GetAdminSystemModelDefaultConfigResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type getDefaultQuery = AdminSystemModelReference;

export type getDefaultBody = Record<string, never>;

async function handler(
  req: ApiRequestProps<getDefaultBody, getDefaultQuery>,
  _res: ApiResponseType<any>
): Promise<GetAdminSystemModelDefaultConfigResponse> {
  await authSystemAdmin({ req });
  const { modelId } = parseApiInput({ req, querySchema: AdminSystemModelReferenceSchema }).query;

  return GetAdminSystemModelDefaultConfigResponseSchema.parse(await getSystemModelConfig(modelId));
}

export default NextAPI(handler);
