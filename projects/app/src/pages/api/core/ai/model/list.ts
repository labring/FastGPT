import { NextAPI } from '@/service/middleware/entry';
import {
  GetSystemModelsResponseSchema,
  type GetSystemModelsResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { getSystemModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { getModelProviderMetadata } from '@fastgpt/service/core/ai/model/provider/controller';

/** 返回无需鉴权的公开系统模型价格目录。 */
async function handler(): Promise<GetSystemModelsResponse> {
  const modelHandle = await getSystemModelHandle();
  return GetSystemModelsResponseSchema.parse({
    models: modelHandle.getSystemModels().filter((model) => model.isActive),
    providers: getModelProviderMetadata().providers
  });
}

export default NextAPI(handler);
