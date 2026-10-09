import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ModelReferenceSchema,
  type ModelReference,
  type GetModelDetailResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { authAndGetModelInstance } from '@fastgpt/service/support/permission/model/auth';
import { getModelDetailService } from '@fastgpt/service/core/ai/model/query';

/** 获取模型详细信息及渠道关联状态，统一通过 authAndGetModelInstance 进行鉴权与模型定位。 */
async function handler(
  req: ApiRequestProps<Record<string, never>, ModelReference>
): Promise<GetModelDetailResponse> {
  const { modelId, channelType } = parseApiInput({ req, querySchema: ModelReferenceSchema }).query;

  const { model, ownerTmbId } = await authAndGetModelInstance({
    req,
    modelId,
    channelType
  });

  return getModelDetailService({ model, ownerTmbId });
}

export default NextAPI(handler);
