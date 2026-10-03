import type { ChannelListItem } from '@fastgpt/global/openapi/core/ai/channel/api';
import type { AiproxyChannel, AiproxyGroupChannel } from '../../../thirdProvider/aiproxy/type';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import { getTeamMemberMap } from '../../../support/user/team/utils';
import { formatSourceMember } from '../../../support/user/utils';
import {
  getOwnerAssociableModels,
  getSystemAssociableModels,
  type ChannelAssociableModel
} from './association';
import { getMemberGroupId, parseTmbIdFromGroupId } from './utils';

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

/** 获取跨成员渠道分页列表，并复用用户域的展示身份规则。 */
export const getGlobalGroupChannelList = async ({
  groupId,
  pageNum,
  pageSize,
  search
}: {
  groupId?: string;
  pageNum?: number;
  pageSize?: number;
  search?: string;
} = {}): Promise<{ list: ChannelListItem[]; total: number }> => {
  const { channels = [], total = 0 } = await aiProxyClient.globalGroupChannels.list({
    groupId,
    page: pageNum,
    perPage: pageSize,
    search
  });
  // 当前页可能包含同一成员的多个渠道；按成员缓存模型桶，避免每个渠道重复读取运行时目录。
  const ownerModelsByTmb = new Map<string, Promise<ChannelAssociableModel[]>>();
  const getOwnerModelsForChannel = (channel: AiproxyGroupChannel) => {
    const tmbId = parseTmbIdFromGroupId(channel.group_id);
    if (!tmbId) return Promise.resolve<ChannelAssociableModel[]>([]);
    const pending = ownerModelsByTmb.get(tmbId) ?? getOwnerAssociableModels(tmbId);
    ownerModelsByTmb.set(tmbId, pending);
    return pending;
  };
  const list = await Promise.all(
    channels.map(async (channel) =>
      buildChannelListItem(channel, await getOwnerModelsForChannel(channel))
    )
  );
  const tmbIds = list.flatMap((item) => {
    const tmbId = item.group_id ? parseTmbIdFromGroupId(item.group_id) : undefined;
    return tmbId ? [tmbId] : [];
  });
  const memberMap = await getTeamMemberMap({ memberIds: tmbIds, fields: 'name avatar' });

  return {
    list: list.map((item) => {
      const tmbId = item.group_id ? parseTmbIdFromGroupId(item.group_id) : undefined;
      const member = tmbId ? memberMap.get(tmbId) : undefined;
      return {
        ...item,
        ...(member ? { sourceMember: formatSourceMember(member) } : {})
      };
    }),
    total
  };
};
