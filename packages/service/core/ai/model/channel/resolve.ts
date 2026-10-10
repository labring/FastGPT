import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import type { AiproxyChannel, AiproxyGroupChannel } from '../../../../thirdProvider/aiproxy/type';
import { getMemberGroupId } from '../../../../thirdProvider/aiproxy/group';
import { tolerateNotFound } from '../../../../thirdProvider/aiproxy/error';
import { getAiproxyClientByScope } from './client';

type ChannelScope = { channelType: ChannelType; tmbId: string };

/**
 * 在操作者作用域内读取渠道：system 走系统渠道 API，team 固定走当前会话成员的分组 API。
 * 归属由 API 路径保证（root 也不能借渠道 ID 跨成员操作），作用域内不存在即 `channelNotExist`。
 * 后续写入直接使用同一 `getAiproxyClientByScope`，分组只由 tmbId 推导，无需回传分组信息。
 */
export const resolveChannelForOperation = async ({
  id,
  ...scope
}: ChannelScope & { id: number }): Promise<AiproxyChannel | AiproxyGroupChannel> => {
  const channel = await tolerateNotFound(() => getAiproxyClientByScope(scope).channels.get(id));
  if (!channel) return Promise.reject(ModelErrEnum.channelNotExist);
  return channel;
};

/** 批量校验并读取渠道，所有渠道必须均存在于操作者作用域。 */
export const resolveChannelsForOperation = ({
  ids,
  ...scope
}: ChannelScope & { ids: number[] }): Promise<Array<AiproxyChannel | AiproxyGroupChannel>> =>
  Promise.all(ids.map((id) => resolveChannelForOperation({ id, ...scope })));

/**
 * 推导日志/监控只读范围；存在 channelId 时校验其属于当前作用域。
 * 入口能力（system 仅 root）已由路由层 `authModelScope` 保证；team 固定使用会话 tmbId 推导分组。
 */
export const resolveChannelObservabilityScope = async ({
  channelId,
  ...scope
}: ChannelScope & { channelId?: number }): Promise<{ groupId?: string }> => {
  if (channelId !== undefined) await resolveChannelForOperation({ id: channelId, ...scope });
  return scope.channelType === 'team' ? { groupId: getMemberGroupId(scope.tmbId) } : {};
};
