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
  model_mapping: channel.model_mapping,
  base_url: channel.base_url,
  priority: channel.priority,
  sets: channel.sets,
  used_amount: channel.used_amount,
  request_count: channel.request_count,
  created_at: channel.created_at,
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
