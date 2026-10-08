import type { ChannelListItem } from '@fastgpt/global/openapi/core/ai/model/channel/api';
import type { AiproxyChannel, AiproxyGroupChannel } from '../../../thirdProvider/aiproxy/type';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import {
  getOwnerAssociableModels,
  getSystemAssociableModels,
  type ChannelAssociableModel
} from './association';
import { getMemberGroupId } from '../../../thirdProvider/aiproxy/group';

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
  const { channels = [], total = 0 } = await aiProxyClient.system.channels.list({
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
  tmbId,
  pageNum,
  pageSize,
  search
}: {
  tmbId: string;
  pageNum?: number;
  pageSize?: number;
  search?: string;
}): Promise<{ list: ChannelListItem[]; total: number }> => {
  const ownerModels = await getOwnerAssociableModels(tmbId);
  const { channels = [], total = 0 } = await aiProxyClient
    .group(getMemberGroupId(tmbId))
    .channels.list({ page: pageNum, perPage: pageSize, search });
  return {
    list: channels.map((channel) => buildChannelListItem(channel, ownerModels)),
    total
  };
};
