import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { getModelHandle } from '../model';
import { hasLegacyRequestUrl } from '../legacy/requestUrl';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import type { AiproxyChannel, AiproxyGroupChannel } from '../../../thirdProvider/aiproxy/type';
import { rejectNormalizedAiproxyError } from './error';
import { getMemberGroupId, parseTmbIdFromGroupId } from './utils';

export type ChannelAssociableModel = {
  id: string;
  model: string;
  name?: string;
  isSystem?: boolean;
  tmbId?: string;
  hasRequestUrl?: boolean;
};

export type ChannelBrief = { id: number; name: string; status: number };

/** 从运行时目录读取系统模型桶。 */
export const getSystemAssociableModels = async (): Promise<ChannelAssociableModel[]> => {
  const handle = await getModelHandle();
  return handle.getAllModels().map((item) => ({
    id: item.modelId,
    model: item.model,
    name: item.name,
    isSystem: item.scope === ModelScopeEnum.system || !item.scope,
    hasRequestUrl: hasLegacyRequestUrl(item)
  }));
};

/** 从运行时目录读取指定成员拥有的团队模型桶。 */
export const getOwnerAssociableModels = async (
  tmbId: string
): Promise<ChannelAssociableModel[]> => {
  const handle = await getModelHandle();
  return handle
    .getAllModels()
    .filter((item) => item.tmbId && String(item.tmbId) === tmbId)
    .map((item) => ({
      id: item.modelId,
      model: item.model,
      name: item.name,
      isSystem: false,
      tmbId: item.tmbId ? String(item.tmbId) : undefined
    }));
};

/** 按上游模型名建立模型 ID 到渠道摘要的映射。 */
const pairChannelsToModels = (
  channels: Array<AiproxyChannel | AiproxyGroupChannel> = [],
  models: ChannelAssociableModel[] = []
): Map<string, ChannelBrief[]> => {
  if (!Array.isArray(channels) || !Array.isArray(models)) return new Map();

  const result = new Map<string, ChannelBrief[]>();
  for (const channel of channels) {
    for (const model of models) {
      if (!channel.models?.includes(model.model)) continue;
      result.set(model.id, [
        ...(result.get(model.id) ?? []),
        { id: channel.id, name: channel.name, status: channel.status }
      ]);
    }
  }
  return result;
};

/** 校验成员操作的分组渠道确实属于当前成员。 */
export const assertOwnGroupChannel = (
  channel: AiproxyGroupChannel,
  tmbId: string
): Promise<void> => {
  if (channel.group_id !== getMemberGroupId(tmbId)) {
    return Promise.reject(ModelErrEnum.unAuthChannel);
  }
  return Promise.resolve();
};

/** 返回指定模型 ID 在关联映射中的渠道数量。 */
export const channelCount = (modelId: string, map: Map<string, ChannelBrief[]>): number =>
  map.get(modelId)?.length ?? 0;

/** 按每个模型自身的系统或成员桶批量查询关联渠道。 */
export const getModelChannelsMapByModels = async (
  models: ChannelAssociableModel[]
): Promise<Map<string, ChannelBrief[]>> => {
  try {
    const result = new Map<string, ChannelBrief[]>();
    const systemModels = models.filter((model) => model.isSystem);

    if (systemModels.length > 0) {
      const { channels } = await aiProxyClient.system.channels.list();
      for (const [modelId, modelChannels] of pairChannelsToModels(channels, systemModels)) {
        result.set(modelId, modelChannels);
      }
    }

    const ownerModelsByTmb = new Map<string, ChannelAssociableModel[]>();
    for (const model of models) {
      if (model.isSystem || !model.tmbId) continue;
      const tmbId = String(model.tmbId);
      ownerModelsByTmb.set(tmbId, [...(ownerModelsByTmb.get(tmbId) ?? []), model]);
    }

    for (const [tmbId, ownerModels] of ownerModelsByTmb) {
      const { channels } = await aiProxyClient.group(getMemberGroupId(tmbId)).channels.list();
      for (const [modelId, modelChannels] of pairChannelsToModels(channels, ownerModels)) {
        result.set(modelId, modelChannels);
      }
    }
    return result;
  } catch (error) {
    return rejectNormalizedAiproxyError(error);
  }
};

/** 计算删除单个渠道后将失去全部渠道的模型。 */
export const getChannelAffectedModels = async (
  channel: AiproxyChannel | AiproxyGroupChannel
): Promise<{ modelId: string; name: string; model: string }[]> =>
  getBatchChannelsAffectedModels([channel]);

/** 计算批量删除渠道后将失去全部渠道的模型。 */
export const getBatchChannelsAffectedModels = async (
  channels: Array<AiproxyChannel | AiproxyGroupChannel>
): Promise<{ modelId: string; name: string; model: string }[]> => {
  try {
    if (channels.length === 0) return [];

    const channelsByBucket = new Map<string, Array<AiproxyChannel | AiproxyGroupChannel>>();
    for (const channel of channels) {
      const bucketKey = (channel as AiproxyGroupChannel).group_id ?? 'system';
      channelsByBucket.set(bucketKey, [...(channelsByBucket.get(bucketKey) ?? []), channel]);
    }

    const affectedModels = new Map<string, { modelId: string; name: string; model: string }>();
    for (const [bucketKey, targetChannels] of channelsByBucket) {
      const isSystem = bucketKey === 'system';
      const tmbId = isSystem ? undefined : parseTmbIdFromGroupId(bucketKey);
      const bucketModels = isSystem
        ? await getSystemAssociableModels()
        : tmbId
          ? await getOwnerAssociableModels(tmbId)
          : [];
      if (bucketModels.length === 0) continue;

      const allChannels = isSystem
        ? await aiProxyClient.system.channels.listAll()
        : await aiProxyClient.group(bucketKey).channels.listAll();
      const deletedIds = new Set(targetChannels.map((channel) => channel.id));
      const remainingModelNames = new Set(
        allChannels
          .filter((channel) => !deletedIds.has(channel.id))
          .flatMap((channel) => channel.models ?? [])
      );
      const deletedModelNames = new Set(targetChannels.flatMap((channel) => channel.models ?? []));

      for (const model of bucketModels) {
        // 自包含模型（自带独立 requestUrl）不依赖 AI Proxy 渠道，不计入受影响列表
        if (model.hasRequestUrl) continue;

        if (!deletedModelNames.has(model.model) || remainingModelNames.has(model.model)) continue;
        affectedModels.set(model.id, {
          modelId: model.id,
          name: model.name ?? model.model,
          model: model.model
        });
      }
    }
    return Array.from(affectedModels.values());
  } catch (error) {
    return rejectNormalizedAiproxyError(error);
  }
};

/** 获取指定渠道在自身桶内关联的模型列表。 */
export const getChannelModels = async (
  channel: AiproxyChannel | AiproxyGroupChannel
): Promise<{ modelId: string; name: string; model: string }[]> => {
  const groupId = (channel as AiproxyGroupChannel).group_id;
  const tmbId = groupId ? parseTmbIdFromGroupId(groupId) : undefined;
  const bucketModels = groupId
    ? tmbId
      ? await getOwnerAssociableModels(tmbId)
      : []
    : await getSystemAssociableModels();
  const channelModels = new Set(channel.models ?? []);

  return bucketModels
    .filter((model) => channelModels.has(model.model))
    .map((model) => ({
      modelId: model.id,
      name: model.name ?? model.model,
      model: model.model
    }));
};

/** 获取指定模型在自身桶内关联的渠道数量。 */
export const getModelChannelRefs = async (model: ChannelAssociableModel): Promise<number> => {
  try {
    const channels = model.isSystem
      ? (await aiProxyClient.system.channels.list()).channels
      : model.tmbId
        ? (await aiProxyClient.group(getMemberGroupId(String(model.tmbId))).channels.list())
            .channels
        : [];
    return channels.filter((channel) => channel.models?.includes(model.model)).length;
  } catch (error) {
    return rejectNormalizedAiproxyError(error);
  }
};
