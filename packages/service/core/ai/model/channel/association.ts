import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import type { AiproxyChannel, AiproxyGroupChannel } from '../../../../thirdProvider/aiproxy/type';
import { hasLegacyRequestUrl } from '../../legacy/requestUrl';
import { getSystemModelHandle, getTeamModelHandle } from '../catalog/service';
import { getAiproxyClientByScope } from './client';

/** 渠道关联查询使用的模型投影，不携带完整模型配置。 */
export type ChannelAssociableModel = {
  id: string;
  model: string;
  name?: string;
  hasRequestUrl?: boolean;
};

/**
 * 渠道操作的作用域：system 渠道对应系统模型桶，team 渠道对应当前会话成员的私有分组与其团队模型桶。
 * 渠道已经在同一作用域内解析（见 `resolveChannelForOperation`），这里不再从渠道 group_id 反推归属。
 */
type ChannelBucketScope = {
  channelType: ChannelType;
  teamId: string;
  tmbId: string;
};

/** 从运行时目录读取系统模型桶。 */
export const getSystemAssociableModels = async (): Promise<ChannelAssociableModel[]> => {
  const handle = await getSystemModelHandle();
  return handle.getSystemModels().map((item) => ({
    id: item.modelId,
    model: item.model,
    name: item.name,
    hasRequestUrl: hasLegacyRequestUrl(item)
  }));
};

/** 从团队目录读取指定成员拥有的团队模型桶。 */
export const getOwnerAssociableModels = async ({
  teamId,
  tmbId
}: {
  teamId: string;
  tmbId: string;
}): Promise<ChannelAssociableModel[]> => {
  const handle = await getTeamModelHandle({ teamId });
  return handle.getTeamModels(tmbId).map((item) => ({
    id: item.modelId,
    model: item.model,
    name: item.name
  }));
};

/** 读取作用域对应的模型桶。 */
const getBucketModels = ({ channelType, teamId, tmbId }: ChannelBucketScope) =>
  channelType === 'system'
    ? getSystemAssociableModels()
    : getOwnerAssociableModels({ teamId, tmbId });

/** 计算删除一批渠道后将失去全部渠道的模型；单个渠道删除同样走此函数。 */
export const getChannelsAffectedModels = async ({
  channels,
  ...scope
}: ChannelBucketScope & {
  channels: Array<AiproxyChannel | AiproxyGroupChannel>;
}): Promise<{ modelId: string; name: string; model: string }[]> => {
  if (channels.length === 0) return [];

  const bucketModels = await getBucketModels(scope);
  if (bucketModels.length === 0) return [];

  const allChannels = await getAiproxyClientByScope(scope).channels.listAll();
  const deletedIds = new Set(channels.map((channel) => channel.id));
  const remainingModelNames = new Set(
    allChannels
      .filter((channel) => !deletedIds.has(channel.id))
      .flatMap((channel) => channel.models ?? [])
  );
  const deletedModelNames = new Set(channels.flatMap((channel) => channel.models ?? []));

  return bucketModels.flatMap((model) => {
    // 自包含模型（自带独立 requestUrl）不依赖 AI Proxy 渠道，不计入受影响列表
    if (model.hasRequestUrl) return [];
    if (!deletedModelNames.has(model.model) || remainingModelNames.has(model.model)) return [];
    return [{ modelId: model.id, name: model.name ?? model.model, model: model.model }];
  });
};

/** 获取指定渠道在自身作用域模型桶内关联的模型列表。 */
export const getChannelModels = async ({
  channel,
  ...scope
}: ChannelBucketScope & {
  channel: AiproxyChannel | AiproxyGroupChannel;
}): Promise<{ modelId: string; name: string; model: string }[]> => {
  const bucketModels = await getBucketModels(scope);
  const channelModels = new Set(channel.models ?? []);

  return bucketModels
    .filter((model) => channelModels.has(model.model))
    .map((model) => ({
      modelId: model.id,
      name: model.name ?? model.model,
      model: model.model
    }));
};
