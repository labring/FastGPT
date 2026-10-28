import {
  REASONING_FIELD_MAPPING_CHANNEL_TYPES,
  type ChannelConfig
} from '@fastgpt/global/core/ai/model/channel';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { aiProxyClient } from '../../../../thirdProvider/aiproxy/client';
import type {
  BatchChannelBody,
  UpdateChannelStatusBody,
  ProviderMetasResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import { getCachedTypeMetas } from './cache';
import { resolveChannelForOperation, resolveChannelsForOperation } from './resolve';
import { getAiproxyClientByScope } from './client';
import { getChannelsAffectedModels } from './association';
import { getModelProviderMetadata } from '../provider/controller';

/**
 * 合并上游表单配置与 Plugin 展示元数据，不返回实例渠道或密钥。
 * 展示元数据和顺序每次读取最新缓存；仅两边均存在的类型可创建，历史类型仍可展示。
 */
export const getChannelTypeMetas = async (): Promise<ProviderMetasResponse> => {
  const typeMetas = await getCachedTypeMetas(() => aiProxyClient.getTypeMetas());
  const result: ProviderMetasResponse = Object.fromEntries(
    Object.entries(typeMetas).map(([id, meta]) => [
      id,
      {
        name: meta.name,
        defaultBaseUrl: meta.defaultBaseUrl,
        keyHelp: meta.keyHelp,
        canCreate: false
      }
    ])
  );

  for (const [order, channel] of (getModelProviderMetadata().aiproxyChannels ?? []).entries()) {
    const meta = typeMetas[channel.channelId];
    result[channel.channelId] = {
      name: meta?.name ?? channel.name.en,
      defaultBaseUrl: meta?.defaultBaseUrl ?? '',
      keyHelp: meta?.keyHelp ?? '',
      displayName: channel.name,
      avatar: channel.avatar,
      // 数字键对象会按 ID 遍历，显式保留原数组顺序供前端排序。
      order,
      // SDK 尚未声明官网字段，兼容 Plugin 响应中附带的字符串值。
      website:
        'website' in channel && typeof channel.website === 'string' ? channel.website : undefined,
      canCreate: meta !== undefined
    };
  }
  return result;
};

type ChannelScope = {
  channelType: ChannelType;
  tmbId: string;
};

type AffectedModel = { modelId: string; name: string; model: string };

/** 将上游不同版本的重名错误归一为平台错误码，普通更新与创建共用。 */
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
const assertChannelNameUnique = async ({
  client,
  name,
  excludeId
}: {
  client: typeof aiProxyClient.system.channels;
  name: string;
  excludeId?: number;
}): Promise<void> => {
  const trimmedName = name.trim();
  const { channels = [] } = await client.list({ search: trimmedName });
  if (
    channels.some(
      (c: { id: number; name: string }) =>
        (excludeId === undefined || c.id !== excludeId) && c.name.trim() === trimmedName
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
  channelData: ChannelConfig;
}) => {
  const client = getAiproxyClientByScope({ channelType, tmbId }).channels;
  const data = {
    ...channelData,
    name: channelData.name.trim(),
    // 默认协议配置属于平台创建规则；调用方显式提供的配置（含 false）优先。
    configs: REASONING_FIELD_MAPPING_CHANNEL_TYPES.some((type) => type === channelData.type)
      ? { map_reasoning_to_reasoning_content: true, ...channelData.configs }
      : channelData.configs
  };
  await assertChannelNameUnique({ client, name: data.name });
  try {
    return await client.create(data);
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
}: ChannelScope & { id: number; channelData: Partial<ChannelConfig> }): Promise<void> => {
  await resolveChannelForOperation({ id, channelType, tmbId });
  const client = getAiproxyClientByScope({ channelType, tmbId }).channels;

  if (channelData.name) {
    await assertChannelNameUnique({ client, name: channelData.name, excludeId: id });
  }

  try {
    await client.update(id, channelData);
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
  await resolveChannelForOperation({ id, channelType, tmbId });
  await getAiproxyClientByScope({ channelType, tmbId }).channels.updateStatus(id, status);
};

/** 删除已校验归属的渠道，删除前按 teamId 读取模型目录并计算失去全部可用渠道的模型。 */
export const deleteChannel = async ({
  id,
  channelType,
  tmbId,
  teamId
}: ChannelScope & {
  id: number;
  teamId: string;
}): Promise<{
  affectedModels: AffectedModel[];
}> => {
  const channel = await resolveChannelForOperation({ id, channelType, tmbId });
  const affectedModels = await getChannelsAffectedModels({
    channels: [channel],
    channelType,
    teamId,
    tmbId
  });
  await getAiproxyClientByScope({ channelType, tmbId }).channels.delete(id);
  return { affectedModels };
};

/** 批量操作已校验归属的渠道；删除前计算模型影响，状态切换无需读取模型目录。 */
export const batchOperateChannels = async ({
  body,
  tmbId,
  teamId
}: {
  body: BatchChannelBody;
  tmbId: string;
  teamId: string;
}): Promise<{ affectedModels?: AffectedModel[] }> => {
  const { channelType } = body;
  const channels = await resolveChannelsForOperation({ ids: body.ids, channelType, tmbId });
  const client = getAiproxyClientByScope({ channelType, tmbId }).channels;
  if (body.action === 'delete') {
    const affectedModels = await getChannelsAffectedModels({
      channels,
      channelType,
      teamId,
      tmbId
    });
    await client.batchDelete(body.ids);
    return { affectedModels };
  }

  await client.batchUpdateStatus(body.ids, body.status);
  return {};
};
