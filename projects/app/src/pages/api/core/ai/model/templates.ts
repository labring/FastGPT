import {
  getModelProviderMetadata,
  preloadModelProviders
} from '@fastgpt/service/core/ai/model/provider/controller';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelManage } from '@fastgpt/service/support/permission/model/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { refreshModelTemplates } from '@fastgpt/service/core/ai/model/template';
import {
  GetModelTemplatesQuerySchema,
  GetModelTemplatesResponseSchema,
  type GetModelTemplatesQuery,
  type GetModelTemplatesResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { sortModelsByProvider } from '@fastgpt/global/core/ai/model/provider';

/**
 * 实时返回 Plugin 模型模板；响应不会写入任何运行时或持久化模型缓存。
 * system 仅 root；team 需要“安装模型”权限，成员创建团队模型时也要从模板入口选择。
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetModelTemplatesQuery>
): Promise<GetModelTemplatesResponse> {
  const { channelType } = parseApiInput({
    req,
    querySchema: GetModelTemplatesQuerySchema
  }).query;
  await authModelManage({ req, channelType });

  await preloadModelProviders();
  const models = await refreshModelTemplates();
  const providers = getModelProviderMetadata().providers;

  return GetModelTemplatesResponseSchema.parse({
    models: sortModelsByProvider(models, providers),
    providers
  });
}

export default NextAPI(handler);
