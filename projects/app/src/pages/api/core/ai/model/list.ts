import { getModelProviderMetadata } from '@fastgpt/service/core/app/provider/controller';
import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { NextAPI } from '@/service/middleware/entry';
import {
  GetSystemModelsResponseSchema,
  type GetSystemModelsResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

/** 价格页公开模型接口，只通过响应 Schema 白名单返回最小字段。 */
async function handler(): Promise<GetSystemModelsResponse> {
  const modelHandle = await getModelHandle();
  return GetSystemModelsResponseSchema.parse({
    models: modelHandle.getActiveModels(),
    providers: getModelProviderMetadata().providers
  });
}

export default NextAPI(handler);
