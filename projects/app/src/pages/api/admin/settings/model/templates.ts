import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { preloadModelProviders } from '@fastgpt/service/core/app/provider/controller';
import { refreshModelTemplates } from '@fastgpt/service/core/ai/config/utils';
import {
  GetAdminModelTemplatesResponseSchema,
  type GetAdminModelTemplatesResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

/** 实时返回 Plugin 模型模板；响应不会写入任何运行时或持久化模型缓存。 */
async function handler(req: ApiRequestProps): Promise<GetAdminModelTemplatesResponse> {
  await authSystemAdmin({ req });

  await preloadModelProviders();
  const models = await refreshModelTemplates();

  return GetAdminModelTemplatesResponseSchema.parse({
    models,
    providers: global.ModelProviderRawCache
  });
}

export default NextAPI(handler);
