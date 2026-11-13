import {
  GetModelCatalogQuerySchema,
  type GetModelCatalogResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';

const ModelListQuerySchema = GetModelCatalogQuerySchema.pick({
  includeSourceMember: true,
  orderBy: true
});

export type ModelService = {
  list: (params: {
    client: FastGptHttpClient;
    input: unknown;
  }) => Promise<CliResult<GetModelCatalogResponse>>;
};

/**
 * 读取当前成员的完整可用模型目录，保留 Provider、默认模型和版本信息。
 * CLI 不维护目录缓存，也不接受外链身份，避免版本命中时只得到版本号或切换到发布者身份。
 */
export function createModelService(): ModelService {
  return {
    list: async ({ client, input }) => {
      const query = ModelListQuerySchema.parse(input);
      const catalog = await client.request<GetModelCatalogResponse>({
        method: 'GET',
        path: '/core/ai/model/catalog',
        query
      });

      return createSuccessResult({ data: catalog });
    }
  };
}
