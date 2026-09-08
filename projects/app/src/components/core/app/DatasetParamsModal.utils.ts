import type { MyLLMModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { resolveClientModelReferenceId } from '@/web/core/ai/model/modelReference';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/modelReference';

/**
 * 问题优化开启时保留实际选择；空配置保持未配置，不因打开弹窗或目录加载而补默认值。
 * 保留非空失效 ID，旧名称只做精确转换；关闭时清空 ID，由节点校验检查未完成配置。
 */
export const resolveQueryExtensionModelId = ({
  enabled,
  modelId,
  legacyModel,
  models
}: {
  enabled?: boolean;
  modelId?: string | null;
  legacyModel?: string;
  models: Pick<MyLLMModelItemType, 'modelId' | 'model'>[];
}) => {
  if (!enabled) return;
  if (!isEmptyModelValue(modelId)) return modelId ?? undefined;
  if (!isEmptyModelValue(legacyModel)) {
    return resolveClientModelReferenceId({ models, reference: { model: legacyModel } });
  }
};
