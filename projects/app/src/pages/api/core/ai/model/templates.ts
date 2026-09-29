import { getModelProviderMetadata } from '@fastgpt/service/core/ai/provider/controller';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { preloadModelProviders } from '@fastgpt/service/core/ai/provider/controller';
import { refreshModelTemplates } from '@fastgpt/service/core/ai/model/template';
import {
  GetModelTemplatesResponseSchema,
  type GetModelTemplatesResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { sortModelsByProvider } from '@fastgpt/global/core/ai/model/provider';

/** 实时返回 Plugin 模型模板；响应不会写入任何运行时或持久化模型缓存。 */
async function handler(req: ApiRequestProps): Promise<GetModelTemplatesResponse> {
  await authSystemAdmin({ req });

  await preloadModelProviders();
  const models = await refreshModelTemplates();
  const providers = getModelProviderMetadata().providers;

  return GetModelTemplatesResponseSchema.parse({
    models: sortModelsByProvider(models, providers),
    providers
  });
}

export default NextAPI(handler);
