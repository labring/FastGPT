import type { EmbeddingSystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import { getCachedModelHandle, type ModelHandle } from './config/handle';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';

/**
 * 模型读取的唯一异步入口。并发检查由目录加载器合并，最多等待 5 秒；
 * 超时或失败复用成功发布过的 handle。每个版本只构造一次 handle，调用方无需传递请求上下文。
 */
export const getModelHandle = async (): Promise<ModelHandle> => {
  const { refreshModelHandle } = await import('./config/utils');
  await refreshModelHandle();
  const handle = getCachedModelHandle();
  if (!handle) throw new UserError(ModelErrEnum.unExist);
  return handle;
};

/** 仅判断传入模型的图片能力，不读取目录。 */
export const isImageEmbeddingModel = (model?: EmbeddingSystemModelDataType) =>
  !!model?.config.vision;
