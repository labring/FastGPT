import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import type { ChannelType } from '@fastgpt/global/openapi/core/ai/channel/api';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import type { AiproxyChannel, AiproxyGroupChannel } from '../../../thirdProvider/aiproxy/type';
import { getMemberGroupId } from './utils';
import { normalizeAiproxyError } from './error';

/**
 * 按渠道归属路由查找目标渠道（系统渠道或私有分组渠道）
 */

export type ResolvedChannel =
  | { kind: 'system'; channel: AiproxyChannel }
  | { kind: 'group'; channel: AiproxyGroupChannel; groupId: string };

/** Single-fetch a channel; undefined when aiproxy reports it as missing */
const fetchOrMissing = async <T>(fetch: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await fetch();
  } catch (error) {
    if (normalizeAiproxyError(error) === ModelErrEnum.channelNotExist) return undefined;
    throw error; // real aiproxy failure — propagate for the caller to normalize
  }
};

/**
 * Resolve a channel for a member/root operation by its declared kind. aiproxy
 * failures are normalized (404/500-not-found → channelNotExist, 401/403 →
 * unAuthChannel); an id that does not exist in the declared scope rejects with
 * ModelErrEnum.channelNotExist.
 */
export const resolveChannelForOperation = async ({
  id,
  channelType,
  tmbId,
  isRoot
}: {
  id: number;
  channelType: ChannelType;
  tmbId: string;
  isRoot: boolean;
}): Promise<ResolvedChannel> => {
  try {
    if (channelType === 'system') {
      // Handlers reject non-root callers with rootOnlyPermit before this point.
      const channel = await fetchOrMissing(() => aiProxyClient.system.channels.get(id));
      if (!channel) return Promise.reject(ModelErrEnum.channelNotExist);
      return { kind: 'system', channel };
    }

    if (!isRoot) {
      const groupId = getMemberGroupId(tmbId);
      const channel = await fetchOrMissing(() => aiProxyClient.group(groupId).channels.get(id));
      if (!channel) return Promise.reject(ModelErrEnum.channelNotExist);
      return { kind: 'group', channel, groupId };
    }

    const groupChannel = await fetchOrMissing(() => aiProxyClient.globalGroupChannels.get(id));
    if (!groupChannel) return Promise.reject(ModelErrEnum.channelNotExist);
    return { kind: 'group', channel: groupChannel, groupId: groupChannel.group_id };
  } catch (error) {
    return Promise.reject(normalizeAiproxyError(error));
  }
};

/**
 * 批量校验并解析渠道。所有渠道必须均存在且属于操作者权限范围。
 */
export const resolveChannelsForOperation = async ({
  ids,
  channelType,
  tmbId,
  isRoot
}: {
  ids: number[];
  channelType: ChannelType;
  tmbId: string;
  isRoot: boolean;
}): Promise<ResolvedChannel[]> => {
  return Promise.all(
    ids.map((id) => resolveChannelForOperation({ id, channelType, tmbId, isRoot }))
  );
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
      const channel = await fetchOrMissing(() => aiProxyClient.system.channels.get(channelId));
      if (!channel) return Promise.reject(ModelErrEnum.channelNotExist);
    }
    return {};
  }

  const groupId = getMemberGroupId(tmbId);
  if (channelId !== undefined) {
    const channel = await fetchOrMissing(() =>
      aiProxyClient.group(groupId).channels.get(channelId)
    );
    if (!channel) return Promise.reject(ModelErrEnum.channelNotExist);
  }
  return { groupId };
};
