import type { MyLLMModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { resolveClientModelReferenceId } from '@/web/core/ai/model/modelReference';
import { resolveModelSelectorDefault } from '@/components/Select/AIModelSelector.utils';

/**
 * 问题优化开启时为真正的空配置选择可用默认模型，否则取列表首项；返回值必须写入表单。
 * 保留非空失效 ID，旧名称只做精确转换，不静默替换用户原有模型；关闭时清空 ID。
 */
export const resolveQueryExtensionModelId = ({
  enabled,
  modelId,
  legacyModel,
  models,
  defaultModelId
}: {
  enabled?: boolean;
  modelId?: string | null;
  legacyModel?: string;
  models: Pick<MyLLMModelItemType, 'modelId' | 'model'>[];
  defaultModelId?: string;
}) => {
  if (!enabled) return;
  if (modelId) return modelId;
  if (legacyModel) {
    return resolveClientModelReferenceId({ models, reference: { model: legacyModel } });
  }
  return resolveModelSelectorDefault({ models, defaultModelId })?.modelId;
};
