import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';

type ClientModelReference = {
  modelId?: string;
  model?: string;
};

/**
 * 解析同时兼容 modelId 与旧 model 的单个选择值。先全量匹配 modelId，再匹配旧 model，
 * 避免某个模型的旧名称与另一个模型的稳定 ID 相同时产生歧义。
 */
export const findClientModelByValue = <T extends Pick<MyModelItemType, 'modelId' | 'model'>>({
  models,
  value
}: {
  models: T[];
  value?: string;
}) => {
  if (value === undefined) return;
  return (
    models.find((item) => item.modelId === value) ?? models.find((item) => item.model === value)
  );
};

/**
 * 按双字段模型引用查找客户端模型。只要 modelId 字段存在就禁止降级到旧 model，确保前端
 * 与服务端对空字符串、失效 ID 和 ID/name 冲突采用完全一致的优先级。
 */
export const findClientModelByReference = <T extends Pick<MyModelItemType, 'modelId' | 'model'>>({
  models,
  reference
}: {
  models: T[];
  reference: ClientModelReference;
}) => {
  if (reference.modelId !== undefined) {
    return models.find((item) => item.modelId === reference.modelId);
  }
  if (reference.model === undefined) return;
  return models.find((item) => item.model === reference.model);
};

/**
 * 将双字段引用规范化为 modelId。已有 modelId（包括空字符串或失效值）原样保留；只有字段
 * 完全缺失时才允许按旧 model 精确恢复稳定 ID。
 */
export const resolveClientModelReferenceId = <
  T extends Pick<MyModelItemType, 'modelId' | 'model'>
>({
  models,
  reference
}: {
  models: T[];
  reference: ClientModelReference;
}) => {
  if (reference.modelId !== undefined) return reference.modelId;
  if (reference.model === undefined) return;
  return models.find((item) => item.model === reference.model)?.modelId;
};
