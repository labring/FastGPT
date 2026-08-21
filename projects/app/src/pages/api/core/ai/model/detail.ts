import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModel } from '@fastgpt/service/support/permission/model/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetModelDetailQuerySchema,
  GetModelDetailResponseSchema,
  type GetModelDetailQuery,
  type GetModelDetailResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(
  req: ApiRequestProps<Record<string, never>, GetModelDetailQuery>,
  _res: ApiResponseType<GetModelDetailResponse>
): Promise<GetModelDetailResponse> {
  const {
    id: modelId,
    appId,
    datasetId
  } = parseApiInput({
    req,
    querySchema: GetModelDetailQuerySchema
  }).query;

  const resourceContext = appId ? { appId } : datasetId ? { datasetId } : undefined;

  const { modelData } = await authModel({
    modelId,
    per: ReadPermissionVal,
    req,
    authToken: true,
    resourceContext
  });

  return GetModelDetailResponseSchema.parse(modelData);
}

export default NextAPI(handler);
