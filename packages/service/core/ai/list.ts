import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';

type PaginateAvailableModelsProps = {
  models: SystemModelDataType[];
  modelType?: ModelTypeEnum;
  provider?: string;
  pageNum?: number;
  pageSize?: number;
  offset?: number;
  getProviderOrder: (provider: string) => number;
};

/**
 * 对已经过成员权限过滤的模型做类型过滤、Provider 聚合和稳定分页。
 * providers 在显式 Provider 过滤前计算，保证前端切换 Provider 后仍能看到完整分组列表。
 */
export const paginateAvailableModels = ({
  models,
  modelType,
  provider,
  pageNum = 1,
  pageSize = 10,
  offset,
  getProviderOrder
}: PaginateAvailableModelsProps) => {
  const availableModels = models
    .filter((model) => model.isActive)
    .filter((model) => !modelType || model.type === modelType)
    .sort(
      (a, b) =>
        getProviderOrder(a.provider) - getProviderOrder(b.provider) ||
        a.name.localeCompare(b.name) ||
        a.model.localeCompare(b.model) ||
        a.modelId.localeCompare(b.modelId)
    );
  const providers = [...new Set(availableModels.map((model) => model.provider))];
  const filteredModels = provider
    ? availableModels.filter((model) => model.provider === provider)
    : availableModels;
  const start = offset ?? (pageNum - 1) * pageSize;

  return {
    total: filteredModels.length,
    list: filteredModels.slice(start, start + pageSize),
    providers
  };
};
