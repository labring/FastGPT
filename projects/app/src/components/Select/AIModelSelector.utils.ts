import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';

/** 只有明确使用 modelId 且值为合法 ObjectId 时，才可调用内部单模型接口。 */
export const getModelSelectorModelId = (
  value: string,
  valueField: 'modelId' | 'model'
): string | undefined =>
  valueField === 'modelId' && /^[a-f\d]{24}$/i.test(value) ? value : undefined;

/** 判断模型是否落在调用方传入的兼容白名单中；兼容白名单可同时使用 modelId 或旧 model。 */
export const isModelAllowedByValues = (
  model: Pick<MyModelItemType, 'modelId' | 'model'>,
  allowedValues?: ReadonlySet<string>
) =>
  allowedValues === undefined || allowedValues.has(model.modelId) || allowedValues.has(model.model);

/**
 * 根据发现请求和当前值确定分组模式的 Provider。
 * 当前已选模型优先，避免首次请求先落到第一个 Provider 后无法恢复非首 Provider 的历史值。
 */
export const resolveModelSelectorProvider = ({
  total,
  pageSize,
  providers,
  selectedProvider,
  currentProvider
}: {
  total: number;
  pageSize: number;
  providers: string[];
  selectedProvider?: string;
  currentProvider?: string;
}) => {
  if (total <= pageSize) return '';
  if (selectedProvider && providers.includes(selectedProvider)) return selectedProvider;
  if (currentProvider && providers.includes(currentProvider)) return currentProvider;
  return providers[0] ?? '';
};
