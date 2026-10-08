import { Types } from '../../../common/mongo';
import { getModelHandle } from '../model';
import { getTeamModelsByTmbId } from '../model/teamModelCache';
import { hasLegacyRequestUrl } from '../legacy/requestUrl';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import type { AiproxyChannel, AiproxyGroupChannel } from '../../../thirdProvider/aiproxy/type';
import { parseTmbIdFromGroupId } from '../../../thirdProvider/aiproxy/group';

export type ChannelAssociableModel = {
  id: string;
  model: string;
  name?: string;
  isSystem?: boolean;
  tmbId?: string;
  hasRequestUrl?: boolean;
};

/** 从运行时目录读取系统模型桶。 */
export const getSystemAssociableModels = async (): Promise<ChannelAssociableModel[]> => {
  const handle = await getModelHandle();
  return handle.getSystemModels().map((item) => ({
    id: item.modelId,
    model: item.model,
    name: item.name,
    isSystem: true,
    hasRequestUrl: hasLegacyRequestUrl(item)
  }));
};

/** 从团队模型缓存读取指定成员拥有的团队模型桶（复用 LRU 缓存与版本管理）。 */
export const getOwnerAssociableModels = async (
  tmbId: string
): Promise<ChannelAssociableModel[]> => {
  if (!tmbId || !Types.ObjectId.isValid(tmbId)) return [];

  const models = await getTeamModelsByTmbId(tmbId);

  return models.map((item) => ({
    id: item.modelId,
    model: item.model,
    name: item.name,
    isSystem: false,
    tmbId
  }));
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
