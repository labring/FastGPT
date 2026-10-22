import type { AIModelDataType, ModelReferenceType } from '@fastgpt/global/core/ai/model/schema';

export type TrainingAuditModelLabel = {
  /** 稳定模型 ID，模型改名后仍能追踪到同一次调整。 */
  modelId: string;
  /** 人读展示名，优先取目录里的 name，取不到才退回 model 或 ID。 */
  modelName: string;
};

/**
 * 把已解析的模型和知识库保存的引用格式化为审计标签，不读取模型目录。
 *
 * 调用方复用鉴权快照解析旧模型，新模型直接使用鉴权结果，避免审计重复检查目录版本。
 * 展示名优先取 name，其次取 provider 侧的 model；模型已删除时退回保存的历史标识，
 * 仅有 ID 时用 ID 展示。稳定 modelId 单独保留，便于追踪改名前后的同一模型。
 */
export const getTrainingAuditModelLabel = ({
  reference,
  model
}: {
  reference: ModelReferenceType;
  model?: Pick<AIModelDataType, 'modelId' | 'model' | 'name'>;
}): TrainingAuditModelLabel => {
  const referenceId = String(reference.modelId ?? '');
  const referenceName = String(reference.model ?? '');

  return {
    modelId: model?.modelId ?? (referenceId || referenceName),
    // 空展示名也需回退；历史 model 比内部 ID 更适合人工排查。
    modelName: model?.name || model?.model || referenceName || referenceId
  };
};
