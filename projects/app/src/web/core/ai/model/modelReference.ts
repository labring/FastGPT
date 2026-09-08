import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/modelReference';

type ClientModelReference = {
  modelId?: string | null;
  model?: string | null;
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
  if (isEmptyModelValue(value)) return;
  return (
    models.find((item) => item.modelId === value) ?? models.find((item) => item.model === value)
  );
};

/**
 * 按双字段模型引用查找客户端模型。非空 ID 不降级到旧 model，空值规则与服务端一致。
 */
export const findClientModelByReference = <T extends Pick<MyModelItemType, 'modelId' | 'model'>>({
  models,
  reference
}: {
  models: T[];
  reference: ClientModelReference;
}) => {
  if (!isEmptyModelValue(reference.modelId)) {
    return models.find((item) => item.modelId === reference.modelId);
  }
  if (isEmptyModelValue(reference.model)) return;
  return models.find((item) => item.model === reference.model);
};

/**
 * 将双字段引用规范化为 modelId。非空 ID（包括失效值）原样保留，未填写时精确解析旧名称。
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
  if (!isEmptyModelValue(reference.modelId)) return reference.modelId ?? undefined;
  if (isEmptyModelValue(reference.model)) return;
  return models.find((item) => item.model === reference.model)?.modelId;
};
