import type { EmbeddingSystemModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { getCachedModelHandle, getScopedTeamModelHandle, type ModelHandle } from './handle';
import { refreshModelHandle } from './catalog';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';

/**
 * 模型读取的唯一异步入口。并发检查由目录加载器合并，最多等待 5 秒；
 * 超时或失败复用成功发布过的 handle。若传入 context.teamId，则返回结合系统模型与该团队模型的 Scoped Handle。
 */
export const getModelHandle = async (context?: { teamId?: string }): Promise<ModelHandle> => {
  await refreshModelHandle();
  const handle = getCachedModelHandle();
  if (!handle) throw new UserError(ModelErrEnum.unExist);
  if (!context?.teamId) {
    return handle;
  }
  return getScopedTeamModelHandle(context.teamId, handle);
};

/** 仅判断传入模型的图片能力，不读取目录。 */
export const isImageEmbeddingModel = (model?: EmbeddingSystemModelDataType) =>
  !!model?.config.vision;
