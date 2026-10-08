import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type {
  CreateModelResponse,
  UpdateModelBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ChannelType } from '@fastgpt/global/openapi/core/ai/model/channel/api';
import { getLogger, LogCategories } from '../../../common/logger';
import {
  appendModelToChannels,
  removeModelsFromChannels,
  syncModelNameInChannels
} from '../channel/service';
import { createModel, deleteModels, updateModel } from './mutation';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);

/**
 * 聚合创建模型与其渠道快捷绑定的通用生命周期服务。
 * 1. 调用 createModel 在 Mongo 中完成唯一性校验与事务落库；
 * 2. 若传入 channelIds，调用 appendModelToChannels 进行渠道快捷关联；
 * 3. 渠道绑定属于非强一致副作用，如果追加失败由底层记录日志并安全吞错，不破坏模型已创建成功的事实。
 */
export const createModelWithLifecycle = async ({
  modelData,
  channelType,
  channelIds,
  tmbId,
  teamId
}: {
  modelData: SystemModelDocumentDataType;
  channelType: ChannelType;
  channelIds?: number[];
  tmbId?: string;
  teamId?: string;
}): Promise<CreateModelResponse> => {
  const createResult = await createModel({
    modelData,
    channelType,
    tmbId,
    teamId
  });

  if (channelIds && channelIds.length > 0) {
    await appendModelToChannels({
      channelIds,
      model: modelData.model,
      channelType,
      tmbId: channelType === 'team' ? (tmbId ?? '') : ''
    });
  }

  return createResult;
};

/**
 * 聚合更新模型配置并自动同步渠道上游映射的通用生命周期服务。
 * 1. 自动注入 syncModelNameInChannels；
 * 2. 当模型标识发生变更时，协调更新 Mongo 并在模型所属的作用域桶内同步全部渠道的 models 与 model_mapping；
 * 3. 若渠道同步失败，由底层触发补偿回滚保持两端一致。
 */
export const updateModelWithLifecycle = async ({
  modelId,
  modelData,
  channelType,
  tmbId
}: UpdateModelBody & { tmbId?: string }): Promise<void> => {
  return updateModel({
    modelId,
    modelData,
    channelType,
    tmbId,
    syncModelName: syncModelNameInChannels
  });
};

/**
 * 聚合删除模型及其渠道映射清理的通用生命周期服务。
 * 1. 调用 deleteModels 在 Mongo 事务中删除模型实体、关联探测历史与权限记录，并返回已删除模型的 model 标识列表；
 * 2. 自动调用 removeModelsFromChannels 清理 AIProxy 渠道中对这些已删除模型引用的 models 与 model_mapping 映射；
 * 3. 渠道映射清理属于 AIProxy 侧副作用，若失败仅记录错误日志，不回滚已成功删除的 Mongo 实体。
 */
export const deleteModelsWithLifecycle = async ({
  modelIds,
  channelType,
  tmbId
}: {
  modelIds: string[];
  channelType: ChannelType;
  tmbId?: string;
}): Promise<string[]> => {
  const deletedModels = await deleteModels({
    modelIds,
    channelType,
    tmbId
  });

  try {
    await removeModelsFromChannels({
      models: deletedModels,
      channelType,
      tmbId: channelType === 'team' ? (tmbId ?? '') : ''
    });
  } catch (error) {
    logger.error('Clean up channel mappings after model deletion failed', {
      channelType,
      models: deletedModels,
      error
    });
  }

  return deletedModels;
};
