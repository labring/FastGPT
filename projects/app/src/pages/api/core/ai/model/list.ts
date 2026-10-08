import { NextAPI } from '@/service/middleware/entry';
import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { getModelProviderMetadata } from '@fastgpt/service/core/ai/model/provider/controller';
import {
  GetSystemModelsResponseSchema,
  type GetSystemModelsResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

/** 返回无需鉴权的公开系统模型价格目录。 */
async function handler(): Promise<GetSystemModelsResponse> {
  const modelHandle = await getModelHandle();
  return GetSystemModelsResponseSchema.parse({
    models: modelHandle.getSystemModels().filter((model) => model.isActive),
    providers: getModelProviderMetadata().providers
  });
}

export default NextAPI(handler);
