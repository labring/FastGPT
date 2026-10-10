import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { ModelHandle } from '@fastgpt/service/core/ai/model/catalog/handle';
import { authModels, type ModelActor } from '@fastgpt/service/support/permission/model/auth';

/**
 * 校验知识库创建时选定模型的使用权，返回最终使用的 VLM 模型。
 * - 向量模型、文本模型，以及用户显式选择的 VLM 无权限时直接拒绝。
 * - 未显式选择、由系统默认补齐的 VLM 无权限时降级为不设置，避免默认值阻断创建。
 */
export const authDatasetCreateModels = async <VlmModel extends { modelId: string }>({
  actor,
  handle,
  vectorModel,
  agentModel,
  vlmModel,
  explicitVlm
}: {
  actor: ModelActor;
  handle: ModelHandle;
  vectorModel: { modelId: string };
  agentModel: { modelId: string };
  vlmModel?: VlmModel;
  /** 请求是否显式传入 VLM 引用（包括显式清空）。 */
  explicitVlm: boolean;
}): Promise<VlmModel | undefined> => {
  const deniedIds = new Set(
    await authModels({
      actor,
      handle,
      action: 'use',
      modelIds: [vectorModel.modelId, agentModel.modelId, ...(vlmModel ? [vlmModel.modelId] : [])]
    })
  );
  const isVlmDenied = !!vlmModel && deniedIds.has(vlmModel.modelId);

  if (
    deniedIds.has(vectorModel.modelId) ||
    deniedIds.has(agentModel.modelId) ||
    (explicitVlm && isVlmDenied)
  ) {
    throw new UserError(ModelErrEnum.unAuthModel);
  }
  return isVlmDenied ? undefined : vlmModel;
};
