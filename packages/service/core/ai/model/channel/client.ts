import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import { aiProxyClient } from '../../../../thirdProvider/aiproxy/client';
import { getMemberGroupId } from '../../../../thirdProvider/aiproxy/group';

type ChannelScope = { channelType: ChannelType; tmbId: string };

/** 从 AI Proxy 分组 ID 选择 system 或 group API；未提供分组 ID 时表示 system。 */
export const getAiproxyClientByGroupId = (groupId?: string) =>
  groupId ? aiProxyClient.group(groupId) : aiProxyClient.system;

/** 根据当前会话的模型作用域选择 AI Proxy 客户端，成员分组 ID 只由服务端推导。 */
export function getAiproxyClientByScope(scope: {
  channelType: 'system';
  tmbId: string;
}): typeof aiProxyClient.system;
export function getAiproxyClientByScope(scope: {
  channelType: 'team';
  tmbId: string;
}): ReturnType<typeof aiProxyClient.group>;
export function getAiproxyClientByScope(
  scope: ChannelScope
): typeof aiProxyClient.system | ReturnType<typeof aiProxyClient.group>;
export function getAiproxyClientByScope({ channelType, tmbId }: ChannelScope) {
  return getAiproxyClientByGroupId(channelType === 'system' ? undefined : getMemberGroupId(tmbId));
}
