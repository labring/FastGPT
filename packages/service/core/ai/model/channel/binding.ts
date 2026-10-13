import type {
  AddChannelData,
  AiproxyChannel,
  AiproxyGroupChannel,
  UpdateChannelData
} from '../../../../thirdProvider/aiproxy/type';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import { tolerateNotFound } from '../../../../thirdProvider/aiproxy/error';
import { resolveChannelsForOperation } from './resolve';
import { getAiproxyClientByScope } from './client';
import { getLogger, LogCategories } from '../../../../common/logger';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);

/** 从渠道配置中剔除指定模型名及其 model_mapping 条目；没有任何变化时返回 undefined。 */
const stripModelsFromChannel = (
  channel: AiproxyChannel | AiproxyGroupChannel,
  modelNames: Set<string>
): Pick<AddChannelData, 'models' | 'model_mapping'> | undefined => {
  const currentModels = channel.models ?? [];
  const models = currentModels.filter((name) => !modelNames.has(name));
  const mappingEntries = Object.entries(channel.model_mapping ?? {});
  const model_mapping = Object.fromEntries(
    mappingEntries.filter(([name]) => !modelNames.has(name))
  );
  const mappingChanged = mappingEntries.length !== Object.keys(model_mapping).length;
  if (models.length === currentModels.length && !mappingChanged) return undefined;
  // 映射被删光时不再下发空对象，避免 AI Proxy 把空 map 当作有效配置
  return {
    models,
    model_mapping: Object.keys(model_mapping).length > 0 ? model_mapping : undefined
  };
};

/**
 * 调整一个模型与若干渠道的关联：addChannelIds 追加模型名，removeChannelIds 剔除模型名及映射。
 * 渠道只在当前操作者的 system/成员桶内解析，其他成员的渠道一律按不存在处理；操作幂等。
 * 与创建时的快捷关联不同，这里是用户显式操作，失败必须抛出让前端提示。
 * 多个渠道并行写入，不提供跨渠道事务；失败时可能已有部分渠道更新成功。
 */
export const updateModelChannelBindings = async ({
  model,
  addChannelIds = [],
  removeChannelIds = [],
  channelType,
  tmbId
}: {
  model: string;
  addChannelIds?: number[];
  removeChannelIds?: number[];
  channelType: ChannelType;
  tmbId: string;
}): Promise<void> => {
  const trimmedModel = model.trim();
  if (!trimmedModel) return Promise.reject(ModelErrEnum.invalidModelConfig);

  const [addChannels, removeChannels] = await Promise.all([
    resolveChannelsForOperation({ ids: addChannelIds, channelType, tmbId }),
    resolveChannelsForOperation({ ids: removeChannelIds, channelType, tmbId })
  ]);
  const client = getAiproxyClientByScope({ channelType, tmbId }).channels;

  await Promise.all([
    ...addChannels.map(async (channel) => {
      const currentModels = channel.models ?? [];
      if (currentModels.includes(trimmedModel)) return;
      await client.update(channel.id, {
        models: [...currentModels, trimmedModel],
        ...(channel.model_mapping !== undefined && {
          model_mapping: channel.model_mapping
        })
      });
    }),
    ...removeChannels.map(async (channel) => {
      const patch = stripModelsFromChannel(channel, new Set([trimmedModel]));
      if (!patch) return;
      await client.update(channel.id, patch);
    })
  ]);
};

/**
 * 在模型所属的 system/成员 bucket 内同步上游模型标识。
 * 同时更新 channels.models 和 model_mapping 的公开名 key；中途失败时尽力回滚已写入渠道。
 */
export const syncModelNameInChannels = async ({
  oldModel,
  newModel,
  channelType,
  tmbId
}: {
  oldModel: string;
  newModel: string;
  channelType: ChannelType;
  tmbId: string;
}): Promise<void> => {
  const normalizedOldModel = oldModel.trim();
  const normalizedNewModel = newModel.trim();
  if (!normalizedOldModel || !normalizedNewModel) {
    return Promise.reject(ModelErrEnum.invalidModelConfig);
  }
  if (normalizedOldModel === normalizedNewModel) return;

  const client = getAiproxyClientByScope({ channelType, tmbId }).channels;
  const channels = (await tolerateNotFound(() => client.listAll(), [])) ?? [];
  const updates = channels.flatMap((channel) => {
    const currentModels = channel.models ?? [];
    const nextModels = Array.from(
      new Set(
        currentModels.map((modelName) =>
          modelName === normalizedOldModel ? normalizedNewModel : modelName
        )
      )
    );
    const modelsChanged =
      nextModels.length !== currentModels.length ||
      nextModels.some((modelName, index) => modelName !== currentModels[index]);

    const currentMapping = channel.model_mapping;
    const mappingHasOldModel = currentMapping
      ? Object.prototype.hasOwnProperty.call(currentMapping, normalizedOldModel)
      : false;
    const nextMapping = (() => {
      if (!currentMapping || !mappingHasOldModel) return currentMapping;
      const oldMappingValue = currentMapping[normalizedOldModel];
      return Object.fromEntries([
        ...Object.entries(currentMapping).filter(([modelName]) => modelName !== normalizedOldModel),
        ...(!Object.prototype.hasOwnProperty.call(currentMapping, normalizedNewModel)
          ? [[normalizedNewModel, oldMappingValue] as const]
          : [])
      ]);
    })();

    if (!modelsChanged && !mappingHasOldModel) return [];
    return [
      {
        channelId: channel.id,
        patch: {
          ...(modelsChanged && { models: nextModels }),
          ...(mappingHasOldModel && { model_mapping: nextMapping })
        } satisfies UpdateChannelData,
        rollbackPatch: {
          ...(modelsChanged && { models: currentModels }),
          ...(mappingHasOldModel && { model_mapping: currentMapping })
        } satisfies UpdateChannelData
      }
    ];
  });

  const completedUpdates: typeof updates = [];
  try {
    for (const update of updates) {
      await client.update(update.channelId, update.patch);
      completedUpdates.push(update);
    }
  } catch (error) {
    const rollbacks = await Promise.allSettled(
      completedUpdates.map((update) => client.update(update.channelId, update.rollbackPatch))
    );
    rollbacks.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error('Rollback channel model rename failed', {
          channelId: completedUpdates[index].channelId,
          channelType,
          tmbId,
          oldModel,
          newModel,
          error: result.reason
        });
      }
    });
    throw error;
  }
};

/**
 * 模型删除后清理所在桶（system 或成员分组）内全部渠道对这些模型名的引用，包括 models 与 model_mapping。
 * 渠道本身以及其他模型的映射保持不变；桶尚未创建（AI Proxy 404）视为无需清理。
 */
export const removeModelsFromChannels = async ({
  models,
  channelType,
  tmbId
}: {
  models: string[];
  channelType: ChannelType;
  tmbId: string;
}): Promise<void> => {
  const modelNames = new Set(models.map((name) => name.trim()).filter(Boolean));
  if (modelNames.size === 0) return;

  const client = getAiproxyClientByScope({ channelType, tmbId }).channels;
  const channels = (await tolerateNotFound(() => client.listAll(), [])) ?? [];

  await Promise.all(
    channels.map(async (channel) => {
      const patch = stripModelsFromChannel(channel, modelNames);
      if (!patch) return;
      await client.update(channel.id, patch);
    })
  );
};
