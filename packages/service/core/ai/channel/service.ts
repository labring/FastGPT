import type { AddChannelData } from '../../../thirdProvider/aiproxy/type';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import type {
  BatchChannelBody,
  ChannelBody,
  ChannelType,
  UpdateChannelStatusBody
} from '@fastgpt/global/openapi/core/ai/channel/api';
import { getBatchChannelsAffectedModels, getChannelAffectedModels } from './association';
import { getCachedTypeMetas } from './cache';
import {
  resolveChannelForOperation,
  resolveChannelsForOperation,
  type ResolvedChannel
} from './resolve';
import { getMemberGroupId } from './utils';

/** 获取并缓存渠道提供商的表单元数据。 */
export const getChannelTypeMetas = (): Promise<
  Record<number, { defaultBaseUrl: string; keyHelp: string; name: string }>
> => getCachedTypeMetas(() => aiProxyClient.getTypeMetas());

type ChannelScope = {
  channelType: ChannelType;
  tmbId: string;
  isRoot: boolean;
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
  const name = channelData.name.trim();
  const allChannels = await client.listAll();
  if (allChannels.some((c) => c.name.trim() === name)) {
    return Promise.reject(ModelErrEnum.channelNameConflict);
  }
  await client.create(toChannelData(channelData));
};

/** 更新渠道并统一处理 system/team 两种 AIProxy scope。 */
export const updateChannel = async ({
  id,
  channelType,
  tmbId,
  isRoot,
  channelData
}: ChannelScope & { id: number; channelData: ChannelBody }): Promise<void> => {
  const resolved = await resolveChannelForOperation({ id, channelType, tmbId, isRoot });
  const client =
    resolved.kind === 'system'
      ? aiProxyClient.system.channels
      : aiProxyClient.group(resolved.groupId).channels;

  if (channelData.name) {
    const name = channelData.name.trim();
    const allChannels = await client.listAll();
    if (allChannels.some((c) => c.id !== id && c.name.trim() === name)) {
      return Promise.reject(ModelErrEnum.channelNameConflict);
    }
  }

  await client.update(id, toChannelData(channelData));
};

/** 切换渠道状态。 */
export const updateChannelStatus = async ({
  id,
  status,
  channelType,
  tmbId,
  isRoot
}: UpdateChannelStatusBody & Pick<ChannelScope, 'tmbId' | 'isRoot'>): Promise<void> => {
  const resolved = await resolveChannelForOperation({ id, channelType, tmbId, isRoot });
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
  tmbId,
  isRoot
}: ChannelScope & { id: number }): Promise<{
  affectedModels: Awaited<ReturnType<typeof getChannelAffectedModels>>;
}> => {
  const resolved = await resolveChannelForOperation({ id, channelType, tmbId, isRoot });
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
  tmbId,
  isRoot
}: {
  body: BatchChannelBody;
  tmbId: string;
  isRoot: boolean;
}): Promise<{ affectedModels?: Awaited<ReturnType<typeof getBatchChannelsAffectedModels>> }> => {
  const resolved = await resolveChannelsForOperation({
    ids: body.ids,
    channelType: body.channelType,
    tmbId,
    isRoot
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
