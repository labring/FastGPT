import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authModel } from '@fastgpt/service/support/permission/model/auth';
import {
  GetModelDetailQuerySchema,
  GetModelDetailResponseSchema,
  type GetModelDetailQuery,
  type GetModelDetailResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(
  req: ApiRequestProps<any, GetModelDetailQuery>,
  res: ApiResponseType<any>
): Promise<GetModelDetailResponse> {
  const { id } = GetModelDetailQuerySchema.parse(req.query);
  const { model: modelItem } = await authModel({
    req,
    authToken: true,
    authApiKey: true,
    modelId: id,
    per: ReadPermissionVal
  });

  return GetModelDetailResponseSchema.parse(modelItem);
}

export default NextAPI(handler);
