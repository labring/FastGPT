import {
  REASONING_FIELD_MAPPING_CHANNEL_TYPES,
  type ChannelConfig
} from '@fastgpt/global/core/ai/model/channel';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { aiProxyClient } from '../../../../thirdProvider/aiproxy/client';
import type {
  BatchChannelBody,
  UpdateChannelStatusBody
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import { getCachedTypeMetas } from './cache';
import { resolveChannelForOperation, resolveChannelsForOperation } from './resolve';
import { getAiproxyClientByGroupId, getAiproxyClientByScope } from './client';
import { getChannelAffectedModels, getBatchChannelsAffectedModels } from './association';

/** 获取并缓存渠道提供商的表单元数据。 */
export const getChannelTypeMetas = (): Promise<
  Record<number, { defaultBaseUrl: string; keyHelp: string; name: string }>
> => getCachedTypeMetas(() => aiProxyClient.getTypeMetas());

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
  const resolved = await resolveChannelForOperation({ id, channelType, tmbId });
  const client = getAiproxyClientByGroupId(
    resolved.kind === 'group' ? resolved.groupId : undefined
  ).channels;

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
  const resolved = await resolveChannelForOperation({ id, channelType, tmbId });
  await getAiproxyClientByGroupId(
    resolved.kind === 'group' ? resolved.groupId : undefined
  ).channels.updateStatus(id, status);
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
  const resolved = await resolveChannelForOperation({ id, channelType, tmbId });
  const affectedModels = await getChannelAffectedModels(resolved.channel, teamId);
  await getAiproxyClientByGroupId(
    resolved.kind === 'group' ? resolved.groupId : undefined
  ).channels.delete(id);
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
  const resolved = await resolveChannelsForOperation({
    ids: body.ids,
    channelType: body.channelType,
    tmbId
  });
  if (body.action === 'delete') {
    const affectedModels = await getBatchChannelsAffectedModels(
      resolved.map((item) => item.channel),
      teamId
    );
    await getAiproxyClientByScope({ channelType: body.channelType, tmbId }).channels.batchDelete(
      body.ids
    );
    return { affectedModels };
  }

  await getAiproxyClientByScope({
    channelType: body.channelType,
    tmbId
  }).channels.batchUpdateStatus(body.ids, body.status);
  return {};
};
