import {
  CHAT_UPSTREAM_PROTOCOL_CHANNEL_TYPES,
  ChatUpstreamProtocolSchema
} from '@fastgpt/global/core/ai/model/channel';
import type { ChannelListItem } from '@fastgpt/global/openapi/core/ai/model/channel/api';
import type { AiproxyChannel, AiproxyGroupChannel } from '../../../../thirdProvider/aiproxy/type';
import { getAiproxyClientByGroupId, getAiproxyClientByScope } from './client';
import {
  getSystemAssociableModels,
  getOwnerAssociableModels,
  type ChannelAssociableModel
} from './association';

/** 将 AIProxy 渠道投影为列表项，并按同一作用域的模型目录计算关联数。 */
const buildChannelListItem = (
  channel: AiproxyChannel | AiproxyGroupChannel,
  bucketModels: ChannelAssociableModel[]
): ChannelListItem => ({
  id: channel.id,
  name: channel.name,
  type: channel.type,
  status: channel.status,
  models: channel.models ?? [],
  // 渠道配置可能包含凭证，只投影已配置的协议；缺失时由表单提供默认值。
  configs:
    CHAT_UPSTREAM_PROTOCOL_CHANNEL_TYPES.some((type) => type === channel.type) &&
    channel.configs?.chat_upstream_protocol !== undefined
      ? {
          chat_upstream_protocol: ChatUpstreamProtocolSchema.parse(
            channel.configs?.chat_upstream_protocol
          )
        }
      : undefined,
  // AI Proxy 对未配置字段可能返回 null（Go nil 序列化），统一归一化为 undefined 以符合 FastGPT 契约
  model_mapping: channel.model_mapping ?? undefined,
  base_url: channel.base_url ?? undefined,
  priority: channel.priority ?? undefined,
  sets: channel.sets ?? undefined,
  used_amount: channel.used_amount ?? undefined,
  request_count: channel.request_count ?? undefined,
  created_at: channel.created_at ?? undefined,
  ...((channel as AiproxyGroupChannel).group_id !== undefined
    ? { group_id: (channel as AiproxyGroupChannel).group_id }
    : {}),
  relatedModelCount: bucketModels.filter((model) => channel.models?.includes(model.model)).length
});

/** 获取系统渠道分页列表，并补充系统模型关联数。 */
export const getSystemChannelList = async ({
  pageNum,
  pageSize,
  search
}: {
  pageNum?: number;
  pageSize?: number;
  search?: string;
} = {}): Promise<{ list: ChannelListItem[]; total: number }> => {
  const systemModels = await getSystemAssociableModels();
  const { channels = [], total = 0 } = await getAiproxyClientByGroupId().channels.list({
    page: pageNum,
    perPage: pageSize,
    search
  });
  return {
    list: channels.map((channel) => buildChannelListItem(channel, systemModels)),
    total
  };
};

/** 获取当前成员渠道分页列表，并补充成员模型关联数。 */
export const getMemberChannelList = async ({
  teamId,
  tmbId,
  pageNum,
  pageSize,
  search
}: {
  teamId: string;
  tmbId: string;
  pageNum?: number;
  pageSize?: number;
  search?: string;
}): Promise<{ list: ChannelListItem[]; total: number }> => {
  const ownerModels = await getOwnerAssociableModels({ teamId, tmbId });
  const { channels = [], total = 0 } = await getAiproxyClientByScope({
    channelType: 'team',
    tmbId
  }).channels.list({ page: pageNum, perPage: pageSize, search });
  return {
    list: channels.map((channel) => buildChannelListItem(channel, ownerModels)),
    total
  };
};
