import { getTeamModelHandle } from '../../ai/model/catalog/service';
import type { ModelReferenceType } from '@fastgpt/global/core/ai/model/schema';

export type TrainingAuditModelLabel = {
  /** 稳定模型 ID，模型改名后仍能追踪到同一次调整。 */
  modelId: string;
  /** 人读展示名，优先取目录里的 name，取不到才退回 model 或 ID。 */
  modelName: string;
};

/**
 * 把知识库保存的模型引用解析成审计展示用的模型标签。
 *
 * 索引模型审计服务于人工排查「谁把索引模型换成了什么」，所以展示名取模型目录里的 `name`，
 * 其次取 provider 侧的 `model`；目录里已经查不到该模型（历史数据或刚被删除）以及目录不可用时，
 * 退回引用里保存的旧标识，名称解析不出来再退回 ID。稳定 `modelId` 单独返回，便于按 ID 追踪
 * 改名前后的同一模型。整个过程不抛错，避免审计影响已经提交的重建流程。
 */
export const getTrainingAuditModelLabel = async ({
  teamId,
  reference
}: {
  teamId: string;
  reference: ModelReferenceType;
}): Promise<TrainingAuditModelLabel> => {
  const referenceId = String(reference.modelId ?? '');
  const referenceName = String(reference.model ?? '');

  // 引用里既没有稳定 ID 也没有历史 model，说明该槽位从未配置过模型。
  if (!referenceId && !referenceName) return { modelId: '', modelName: '' };

  try {
    const modelHandle = await getTeamModelHandle({ teamId });
    // 引用本身已包含 ID 与历史 model，handle 会优先按 ID 解析，这里不需要二次查找。
    const model = modelHandle.findModelData(reference);
    if (model) {
      return {
        modelId: String(model.modelId),
        modelName: model.name || model.model
      };
    }
  } catch {
    // 模型目录不可用时只影响日志可读性，不能让已经完成的重建流程报错。
  }

  // 目录查不到模型时，历史 model 比 ID 更适合人读，因此名称优先取 model。
  return {
    modelId: referenceId || referenceName,
    modelName: referenceName || referenceId
  };
};
