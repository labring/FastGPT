import type { AddChannelData, UpdateChannelData } from '../../../thirdProvider/aiproxy/type';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import type {
  BatchChannelBody,
  ChannelBody,
  ChannelType,
  UpdateChannelStatusBody
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import { getBatchChannelsAffectedModels, getChannelAffectedModels } from './association';
import { getCachedTypeMetas } from './cache';
import { tolerateNotFound } from '../../../thirdProvider/aiproxy/error';
import {
  resolveChannelForOperation,
  resolveChannelsForOperation,
  type ResolvedChannel
} from './resolve';
import { getMemberGroupId } from '../../../thirdProvider/aiproxy/group';

/** 获取并缓存渠道提供商的表单元数据。 */
export const getChannelTypeMetas = (): Promise<
  Record<number, { defaultBaseUrl: string; keyHelp: string; name: string }>
> => getCachedTypeMetas(() => aiProxyClient.getTypeMetas());

type ChannelScope = {
  channelType: ChannelType;
  tmbId: string;
};

const toChannelData = (data: ChannelBody): AddChannelData => ({
  name: data.name,
  type: data.type,
  key: data.key,
  models: data.models,
  ...(data.base_url !== undefined && { base_url: data.base_url }),
  ...(data.model_mapping !== undefined && { model_mapping: data.model_mapping }),
  ...(data.priority !== undefined && { priority: data.priority }),
  ...(data.status !== undefined && { status: data.status }),
  ...(data.sets !== undefined && { sets: data.sets }),
  ...(data.configs !== undefined && { configs: data.configs })
});

/** 仅转发请求中显式提供的字段，避免用空值覆盖 AI Proxy 中的密钥或其他配置。 */
const toChannelUpdateData = (data: Partial<ChannelBody>): UpdateChannelData => ({
  ...(data.name !== undefined && { name: data.name }),
  ...(data.type !== undefined && { type: data.type }),
  ...(data.key !== undefined && { key: data.key }),
  ...(data.models !== undefined && { models: data.models }),
  ...(data.base_url !== undefined && { base_url: data.base_url }),
  ...(data.model_mapping !== undefined && { model_mapping: data.model_mapping }),
  ...(data.priority !== undefined && { priority: data.priority }),
  ...(data.status !== undefined && { status: data.status }),
  ...(data.sets !== undefined && { sets: data.sets }),
  ...(data.configs !== undefined && { configs: data.configs })
});

const getChannelClient = ({ channelType, tmbId }: Pick<ChannelScope, 'channelType' | 'tmbId'>) =>
  channelType === 'system'
    ? aiProxyClient.system.channels
    : aiProxyClient.group(getMemberGroupId(tmbId)).channels;

const groupChannelIdsByGroupId = (resolved: ResolvedChannel[]): Map<string, number[]> => {
  const idsByGroup = new Map<string, number[]>();
  for (const item of resolved) {
    if (item.kind !== 'group') continue;
    const ids = idsByGroup.get(item.groupId) ?? [];
    ids.push(item.channel.id);
    idsByGroup.set(item.groupId, ids);
  }
  return idsByGroup;
};

const isChannelNameConflictError = (error: unknown): boolean => {
  const msg =
    (error as { message?: string })?.message ??
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    '';
  return /duplicated|duplicate|already exists|conflict|已存在/i.test(msg);
};

/**
 * 校验渠道名称在当前分组/系统作用域内的唯一性。
 * 使用关键词搜索精准过滤候选集，避免全量拉取。
 */
const assertChannelNameUnique = async (
  client: ReturnType<typeof getChannelClient>,
  name: string,
  excludeId?: number
): Promise<void> => {
  const trimmedName = name.trim();
  const { channels } = await client.list({ search: trimmedName });
  if (
    channels.some(
      (c) => (excludeId === undefined || c.id !== excludeId) && c.name.trim() === trimmedName
    )
  ) {
    return Promise.reject(ModelErrEnum.channelNameConflict);
  }
};

/** 创建渠道；分组归属始终由当前会话成员推导，调用方不能传入 groupId。 */
export const createChannel = async ({
  channelType,
  tmbId,
  channelData
}: {
  channelType: ChannelType;
  tmbId: string;
  channelData: ChannelBody;
}): Promise<void> => {
  const client = getChannelClient({ channelType, tmbId });
  await assertChannelNameUnique(client, channelData.name);
  try {
    await client.create(toChannelData(channelData));
  } catch (error) {
    if (isChannelNameConflictError(error)) {
      return Promise.reject(ModelErrEnum.channelNameConflict);
    }
    throw error;
  }
};

/** 更新渠道并统一处理 system/team 两种 AIProxy scope。 */
export const updateChannel = async ({
  id,
  channelType,
  tmbId,
  channelData
}: ChannelScope & { id: number; channelData: Partial<ChannelBody> }): Promise<void> => {
  const resolved = await resolveChannelForOperation({ id, channelType, tmbId });
  const client =
    resolved.kind === 'system'
      ? aiProxyClient.system.channels
      : aiProxyClient.group(resolved.groupId).channels;

  if (channelData.name) {
    await assertChannelNameUnique(client, channelData.name, id);
  }

  try {
    await client.update(id, toChannelUpdateData(channelData));
  } catch (error) {
    if (isChannelNameConflictError(error)) {
      return Promise.reject(ModelErrEnum.channelNameConflict);
    }
    throw error;
  }
};

/** 切换渠道状态。 */
export const updateChannelStatus = async ({
  id,
  status,
  channelType,
  tmbId
}: UpdateChannelStatusBody & Pick<ChannelScope, 'tmbId'>): Promise<void> => {
  const resolved = await resolveChannelForOperation({ id, channelType, tmbId });
  if (resolved.kind === 'system') {
    await aiProxyClient.system.channels.updateStatus(id, status);
  } else {
    await aiProxyClient.group(resolved.groupId).channels.updateStatus(id, status);
  }
};

/** 删除渠道，并在删除前计算失去全部可用渠道的模型。 */
export const deleteChannel = async ({
  id,
  channelType,
  tmbId
}: ChannelScope & { id: number }): Promise<{
  affectedModels: Awaited<ReturnType<typeof getChannelAffectedModels>>;
}> => {
  const resolved = await resolveChannelForOperation({ id, channelType, tmbId });
  const affectedModels = await getChannelAffectedModels(resolved.channel);
  if (resolved.kind === 'system') {
    await aiProxyClient.system.channels.delete(id);
  } else {
    await aiProxyClient.group(resolved.groupId).channels.delete(id);
  }
  return { affectedModels };
};

/** 批量删除或切换渠道状态，成员渠道按 groupId 分组调用 AIProxy。 */
export const batchOperateChannels = async ({
  body,
  tmbId
}: {
  body: BatchChannelBody;
  tmbId: string;
}): Promise<{ affectedModels?: Awaited<ReturnType<typeof getBatchChannelsAffectedModels>> }> => {
  const resolved = await resolveChannelsForOperation({
    ids: body.ids,
    channelType: body.channelType,
    tmbId
  });
  if (body.action === 'delete') {
    const affectedModels = await getBatchChannelsAffectedModels(
      resolved.map((item) => item.channel)
    );
    if (body.channelType === 'system') {
      await aiProxyClient.system.channels.batchDelete(body.ids);
    } else {
      await Promise.all(
        Array.from(groupChannelIdsByGroupId(resolved)).map(([groupId, ids]) =>
          aiProxyClient.group(groupId).channels.batchDelete(ids)
        )
      );
    }
    return { affectedModels };
  }

  if (body.channelType === 'system') {
    await aiProxyClient.system.channels.batchUpdateStatus(body.ids, body.status);
  } else {
    await Promise.all(
      Array.from(groupChannelIdsByGroupId(resolved)).map(([groupId, ids]) =>
        aiProxyClient.group(groupId).channels.batchUpdateStatus(ids, body.status)
      )
    );
  }
  return {};
};

/** 从渠道配置中剔除指定模型名及其 model_mapping 条目；没有任何变化时返回 undefined。 */
const stripModelsFromChannel = (
  channel: ResolvedChannel['channel'],
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

const getResolvedChannelClient = (item: ResolvedChannel) =>
  item.kind === 'system'
    ? aiProxyClient.system.channels
    : aiProxyClient.group(item.groupId).channels;

/**
 * 在服务端原子调整一个模型与若干渠道的关联：addChannelIds 追加模型名，removeChannelIds 剔除模型名及映射。
 * 渠道只在当前操作者的 system/成员桶内解析，其他成员的渠道一律按不存在处理；操作幂等。
 * 与创建时的快捷关联不同，这里是用户显式操作，失败必须抛出让前端提示。
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

  const [addResolved, removeResolved] = await Promise.all([
    resolveChannelsForOperation({ ids: addChannelIds, channelType, tmbId }),
    resolveChannelsForOperation({ ids: removeChannelIds, channelType, tmbId })
  ]);

  await Promise.all([
    ...addResolved.map(async (item) => {
      const currentModels = item.channel.models ?? [];
      if (currentModels.includes(trimmedModel)) return;
      await getResolvedChannelClient(item).update(item.channel.id, {
        models: [...currentModels, trimmedModel],
        ...(item.channel.model_mapping !== undefined && {
          model_mapping: item.channel.model_mapping
        })
      });
    }),
    ...removeResolved.map(async (item) => {
      const patch = stripModelsFromChannel(item.channel, new Set([trimmedModel]));
      if (!patch) return;
      await getResolvedChannelClient(item).update(item.channel.id, patch);
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

  const client = getChannelClient({ channelType, tmbId });
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
    await Promise.allSettled(
      completedUpdates.map((update) => client.update(update.channelId, update.rollbackPatch))
    );
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

  const client = getChannelClient({ channelType, tmbId });
  const channels = (await tolerateNotFound(() => client.listAll(), [])) ?? [];

  await Promise.all(
    channels.map(async (channel) => {
      const patch = stripModelsFromChannel(channel, modelNames);
      if (!patch) return;
      await client.update(channel.id, patch);
    })
  );
};

/** 将模型追加到指定渠道列表中（用于创建模型时的快捷关联）。 */
export const appendModelToChannels = async ({
  channelIds,
  model,
  channelType,
  tmbId
}: {
  channelIds: number[];
  model: string;
  channelType: ChannelType;
  tmbId: string;
}): Promise<void> => {
  if (channelIds.length === 0) return;

  try {
    await updateModelChannelBindings({ model, addChannelIds: channelIds, channelType, tmbId });
  } catch (_error) {
    // 渠道追加失败属于非致命副作用，不破坏模型本身已创建成功的事实
  }
};
