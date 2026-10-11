import { authModelConfig } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  ModelReferenceSchema,
  type GetModelDetailResponse,
  type ModelReference
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getModelDetailService } from '@fastgpt/service/core/ai/model/config';

/** 获取模型详细信息及渠道关联状态，按 ID 鉴权后读取模型配置。 */
async function handler(
  req: ApiRequestProps<Record<string, never>, ModelReference>
): Promise<GetModelDetailResponse> {
  const { modelId, channelType } = parseApiInput({ req, querySchema: ModelReferenceSchema }).query;

  const {
    models: [model]
  } = await authModelConfig({ req, modelIds: [modelId], channelType });

  return getModelDetailService({ model, ownerTmbId: model.tmbId ?? undefined });
}

export default NextAPI(handler);
