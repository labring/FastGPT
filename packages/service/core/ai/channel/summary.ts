import { getModelProviderMetadata } from '../provider/controller';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import type { AiproxyChannel, AiproxyGroupChannel } from '../../../thirdProvider/aiproxy/type';
import { getMemberGroupId } from './utils';
import { isAiproxyNotFoundError } from './error';

/** 将 AI Proxy 渠道转换为模型管理界面使用的稳定摘要结构。 */
export const formatChannelSummaryItems = (
  channels: Array<AiproxyChannel | AiproxyGroupChannel> = []
) => {
  const metadata = getModelProviderMetadata();
  const protocolMap = new Map(
    (metadata.aiproxyChannels ?? []).map((protocol) => [protocol.channelId, protocol])
  );

  return [...channels]
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0) || b.id - a.id)
    .map((channel) => {
      const protocol = protocolMap.get(channel.type);
      return {
        models: channel.models ?? [],
        summary: {
          id: channel.id,
          name: channel.name,
          protocol: protocol
            ? { name: protocol.name, avatar: protocol.avatar }
            : {
                name: {
                  en: channel.name || String(channel.type),
                  'zh-CN': channel.name || String(channel.type),
                  'zh-Hant': channel.name || String(channel.type)
                },
                avatar: 'model/openai'
              },
          status: channel.status ?? 0
        }
      };
    });
};

/** 按上游模型名索引渠道摘要，供模型列表和详情复用。 */
export const groupChannelSummariesByModel = (
  channelItems: ReturnType<typeof formatChannelSummaryItems> = []
) => {
  const channelsByModel = new Map<string, (typeof channelItems)[number]['summary'][]>();
  for (const channel of channelItems) {
    for (const model of new Set(channel.models)) {
      const modelName = String(model);
      channelsByModel.set(modelName, [...(channelsByModel.get(modelName) ?? []), channel.summary]);
    }
  }
  return channelsByModel;
};

/** 获取系统模型桶使用的渠道摘要。 */
export const getSystemChannelSummaryItems = async () => {
  try {
    const channels = await aiProxyClient.system.channels.listAll();
    return formatChannelSummaryItems(channels);
  } catch (error) {
    if (isAiproxyNotFoundError(error)) {
      return [];
    }
    throw error;
  }
};

/** 获取指定成员模型桶使用的渠道摘要。 */
export const getMemberChannelSummaryItems = async (tmbId: string) => {
  try {
    const channels = await aiProxyClient.group(getMemberGroupId(tmbId)).channels.listAll();
    return formatChannelSummaryItems(channels);
  } catch (error) {
    if (isAiproxyNotFoundError(error)) {
      return [];
    }
    throw error;
  }
};
