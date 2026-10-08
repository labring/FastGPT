import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import type { ChannelType } from '@fastgpt/global/openapi/core/ai/model/channel/api';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import type { AiproxyChannel, AiproxyGroupChannel } from '../../../thirdProvider/aiproxy/type';
import { getMemberGroupId } from '../../../thirdProvider/aiproxy/group';
import { tolerateNotFound } from '../../../thirdProvider/aiproxy/error';

/**
 * 按渠道归属路由查找目标渠道（系统渠道或私有分组渠道）
 */

export type ResolvedChannel =
  | { kind: 'system'; channel: AiproxyChannel }
  | { kind: 'group'; channel: AiproxyGroupChannel; groupId: string };

/**
 * Resolve a channel for a member/root operation by its declared kind.
 * an id that does not exist in the declared scope rejects with ModelErrEnum.channelNotExist.
 */
export const resolveChannelForOperation = async ({
  id,
  channelType,
  tmbId
}: {
  id: number;
  channelType: ChannelType;
  tmbId: string;
}): Promise<ResolvedChannel> => {
  if (channelType === 'system') {
    // Handlers reject non-root callers with rootOnlyPermit before this point.
    const channel = await tolerateNotFound(() => aiProxyClient.system.channels.get(id));
    if (!channel) return Promise.reject(ModelErrEnum.channelNotExist);
    return { kind: 'system', channel };
  }

  // team scope 始终绑定当前会话成员，root 也不能借渠道 ID 跨成员操作。
  const groupId = getMemberGroupId(tmbId);
  const channel = await tolerateNotFound(() => aiProxyClient.group(groupId).channels.get(id));
  if (!channel) return Promise.reject(ModelErrEnum.channelNotExist);
  return { kind: 'group', channel, groupId };
};

/**
 * 批量校验并解析渠道。所有渠道必须均存在且属于操作者权限范围。
 */
export const resolveChannelsForOperation = async ({
  ids,
  channelType,
  tmbId
}: {
  ids: number[];
  channelType: ChannelType;
  tmbId: string;
}): Promise<ResolvedChannel[]> => {
  return Promise.all(ids.map((id) => resolveChannelForOperation({ id, channelType, tmbId })));
};

/**
 * 推导日志/监控只读范围，并在存在 channelId 时校验其属于目标 bucket。
 * 与跨成员运维解析不同，team 对 root 也固定使用当前会话 tmbId，禁止借 channelId
 * 读取其他成员的私有渠道数据。
 */
export const resolveChannelObservabilityScope = async ({
  channelType,
  channelId,
  tmbId,
  isRoot
}: {
  channelType: ChannelType;
  channelId?: number;
  tmbId: string;
  isRoot: boolean;
}): Promise<{ groupId?: string }> => {
  if (channelType === 'system') {
    if (!isRoot) return Promise.reject(ModelErrEnum.rootOnlyPermit);
    if (channelId !== undefined) {
      const channel = await tolerateNotFound(() => aiProxyClient.system.channels.get(channelId));
      if (!channel) return Promise.reject(ModelErrEnum.channelNotExist);
    }
    return {};
  }

  const groupId = getMemberGroupId(tmbId);
  if (channelId !== undefined) {
    const channel = await tolerateNotFound(() =>
      aiProxyClient.group(groupId).channels.get(channelId)
    );
    if (!channel) return Promise.reject(ModelErrEnum.channelNotExist);
  }
  return { groupId };
};
