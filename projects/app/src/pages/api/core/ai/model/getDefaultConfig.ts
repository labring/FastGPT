import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { getSystemModelConfig } from '@fastgpt/service/core/ai/config/utils';
import {
  GetDefaultConfigQuerySchema,
  GetDefaultConfigResponseSchema,
  type GetDefaultConfigQuery,
  type GetDefaultConfigResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(
  req: ApiRequestProps<any, GetDefaultConfigQuery>,
  res: ApiResponseType<any>
): Promise<GetDefaultConfigResponse> {
  await authSystemAdmin({ req });

  const { modelId } = GetDefaultConfigQuerySchema.parse(req.query);

  return GetDefaultConfigResponseSchema.parse(getSystemModelConfig(modelId));
}

export default NextAPI(handler);
