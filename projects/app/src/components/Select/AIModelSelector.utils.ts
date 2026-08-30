import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';

/**
 * 同时识别稳定 modelId 与旧 model 值，并统一归一化为 modelId。
 * modelId 优先，避免某个模型的 model 与另一个模型的 modelId 撞值时产生歧义。
 */
export const resolveModelSelectorSelection = <
  T extends Pick<MyModelItemType, 'modelId' | 'model'>
>({
  models,
  value
}: {
  models: T[];
  value: string;
}) => {
  if (!value) return;

  const model =
    models.find((item) => item.modelId === value) ?? models.find((item) => item.model === value);
  if (!model) return;

  const normalizedValue = model.modelId;
  return {
    model,
    normalizedValue,
    shouldNormalize: normalizedValue !== value
  };
};

/** 判断模型是否落在调用方传入的兼容白名单中；兼容白名单可同时使用 modelId 或旧 model。 */
export const isModelAllowedByValues = (
  model: Pick<MyModelItemType, 'modelId' | 'model'>,
  allowedValues?: ReadonlySet<string>
) =>
  allowedValues === undefined || allowedValues.has(model.modelId) || allowedValues.has(model.model);

/**
 * 将服务端全量模型收敛成调用方白名单对应的发现结果。Provider 只从命中的模型派生，避免
 * 分组选择器渲染没有任何候选项的永久 loading 分组。
 */
export const createRestrictedModelDiscovery = <
  T extends Pick<MyModelItemType, 'modelId' | 'model' | 'provider'>
>({
  models,
  allowedValues
}: {
  models: T[];
  allowedValues: ReadonlySet<string>;
}) => {
  const modelIds = new Set<string>();
  const list = models.filter((model) => {
    if (!isModelAllowedByValues(model, allowedValues) || modelIds.has(model.modelId)) return false;
    modelIds.add(model.modelId);
    return true;
  });

  return {
    list,
    total: list.length,
    providers: Array.from(new Set(list.map((model) => model.provider)))
  };
};

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
