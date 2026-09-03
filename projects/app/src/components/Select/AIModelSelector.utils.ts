import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { findClientModelByValue } from '@/web/core/ai/model/modelReference';

/** 合并调用方只读态、目录加载态和业务禁用提示，任一约束存在时都禁止选择。 */
export const resolveModelSelectorDisabled = ({
  isDisabled,
  loading,
  disableTip
}: {
  isDisabled?: boolean;
  loading: boolean;
  disableTip?: string;
}) => Boolean(isDisabled || loading || disableTip);

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

  const model = findClientModelByValue({ models, value });
  if (!model) return;

  const normalizedValue = model.modelId;
  return {
    model,
    normalizedValue,
    shouldNormalize: normalizedValue !== value
  };
};

/** 从当前可选范围中优先选择系统有效默认模型；默认模型不在范围内时回退第一个候选项。 */
export const resolveModelSelectorDefault = <T extends Pick<MyModelItemType, 'modelId'>>({
  models,
  defaultModelId
}: {
  models: T[];
  defaultModelId?: string;
}) => models.find((model) => model.modelId === defaultModelId) ?? models[0];

/** 判断模型是否落在调用方传入的兼容白名单中；兼容白名单可同时使用 modelId 或旧 model。 */
export const isModelAllowedByValues = (
  model: Pick<MyModelItemType, 'modelId' | 'model'>,
  allowedValues?: ReadonlySet<string>
) =>
  allowedValues === undefined || allowedValues.has(model.modelId) || allowedValues.has(model.model);

/**
 * 按 plugin 模型供应商目录的声明顺序生成选择器分组。
 *
 * 模型目录中可能暂时存在 plugin 尚未声明的供应商；这类分组保留模型出现顺序并追加到末尾，
 * 避免恢复排序的同时把可用模型从选择器中丢掉。
 */
export const resolveModelSelectorProviders = ({
  models,
  providers
}: {
  models: Array<Pick<MyModelItemType, 'provider'>>;
  providers: Array<{ id: string }>;
}) => {
  const modelProviderIds = new Set(models.map((model) => model.provider));
  const orderedProviderIds = providers
    .map((provider) => provider.id)
    .filter((providerId) => modelProviderIds.delete(providerId));

  return [...orderedProviderIds, ...modelProviderIds];
};

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
