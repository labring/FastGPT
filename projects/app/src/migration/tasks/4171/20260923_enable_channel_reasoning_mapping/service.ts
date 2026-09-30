import { axiosWithoutSSRF } from '@fastgpt/service/common/api/axios';
import { getAIProxyAdminConfig } from '@fastgpt/service/thirdProvider/aiproxy/config';
import { withAIProxyChannelMutation } from '@fastgpt/service/thirdProvider/aiproxy/lease';
import { z } from 'zod';

const AIProxyChannelSchema = z
  .object({
    id: z.number().int().positive(),
    models: z.array(z.string()),
    type: z.number().int(),
    name: z.string(),
    base_url: z.string().optional(),
    proxy_url: z.string().nullable().optional(),
    // AI Proxy 会把未配置的模型映射返回为 null，更新时需原样透传。
    model_mapping: z.record(z.string(), z.unknown()).nullable().optional(),
    configs: z.record(z.string(), z.unknown()).nullable().optional(),
    key: z.string().optional(),
    status: z.number().int().optional(),
    priority: z.number().optional(),
    sets: z.array(z.string()).nullable().optional(),
    enabled_auto_balance_check: z.boolean().optional(),
    balance_threshold: z.number().optional(),
    skip_tls_verify: z.boolean().optional(),
    enabled_no_permission_ban: z.boolean().optional(),
    warn_error_rate: z.number().optional(),
    max_error_rate: z.number().optional(),
    created_at: z.number().optional()
  })
  .passthrough();

const AIProxyChannelListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(AIProxyChannelSchema)
});

const AIProxyMutationResponseSchema = z.object({
  success: z.literal(true)
});

type AIProxyChannel = z.infer<typeof AIProxyChannelSchema>;

/** 阻止 AI Proxy v0.6.5 的完整更新接口静默破坏无法往返的字段。 */
const assertChannelUpdateSupported = (channel: AIProxyChannel) => {
  if (channel.balance_threshold !== undefined && channel.balance_threshold !== 0) {
    throw new Error(`AI Proxy v0.6.5 cannot preserve balance_threshold for channel: ${channel.id}`);
  }
};

const getChannelUpdateData = (
  channel: AIProxyChannel,
  models: string[],
  configs = channel.configs
) => {
  assertChannelUpdateSupported(channel);

  return {
    type: channel.type,
    name: channel.name,
    base_url: channel.base_url,
    proxy_url: channel.proxy_url,
    model_mapping: channel.model_mapping,
    configs,
    key: channel.key,
    status: channel.status,
    priority: channel.priority,
    sets: channel.sets,
    enabled_auto_balance_check: channel.enabled_auto_balance_check,
    skip_tls_verify: channel.skip_tls_verify,
    enabled_no_permission_ban: channel.enabled_no_permission_ban,
    warn_error_rate: channel.warn_error_rate,
    max_error_rate: channel.max_error_rate,
    models
  };
};

/** 读取 AI Proxy 的完整渠道快照，供模型绑定查询与替换共用。 */
const getAIProxyChannels = async () => {
  const { baseUrl, token } = getAIProxyAdminConfig();
  const headers = { Authorization: `Bearer ${token}` };
  // AI Proxy v0.6.5 的 /channels/all 是无分页接口，查询参数不会参与服务端处理。
  const { data: response } = await axiosWithoutSSRF.get(`${baseUrl}/api/channels/all`, { headers });

  return {
    channels: AIProxyChannelListResponseSchema.parse(response).data,
    baseUrl,
    headers
  };
};

/**
 * 合并更新指定 AI Proxy 渠道类型的配置。
 * AI Proxy 渠道更新是完整替换，因此这里先读取权威快照、保留原 configs 及其他可往返字段，
 * 在统一写租约内逐条更新，并重新读取校验目标配置；beforeUpdate 用于调用方检查自身租约。
 */
export const mergeAIProxyChannelConfigs = async ({
  channelTypes,
  configPatch,
  beforeUpdate
}: {
  channelTypes: number | readonly number[] | number[];
  configPatch: Record<string, string | number | boolean | null>;
  beforeUpdate: () => Promise<void>;
}) =>
  withAIProxyChannelMutation(async ({ signal, assertValid }) => {
    const typeSet = new Set(Array.isArray(channelTypes) ? channelTypes : [channelTypes as number]);
    const { channels, baseUrl, headers } = await getAIProxyChannels();
    const targetChannels = channels.filter((channel) => typeSet.has(channel.type));
    const channelsToUpdate = targetChannels.filter((channel) =>
      Object.entries(configPatch).some(([key, value]) => !Object.is(channel.configs?.[key], value))
    );

    // 完整 PUT 无法往返非零 balance_threshold；先检查全部目标，避免校验到一半才部分写入。
    channelsToUpdate.forEach(assertChannelUpdateSupported);

    for (const channel of channelsToUpdate) {
      await beforeUpdate();
      assertValid();
      const { data: updateResponse } = await axiosWithoutSSRF.put(
        `${baseUrl}/api/channel/${channel.id}`,
        getChannelUpdateData(channel, channel.models, {
          ...(channel.configs ?? {}),
          ...configPatch
        }),
        { headers, signal, timeout: 30000 }
      );
      AIProxyMutationResponseSchema.parse(updateResponse);
    }

    const { channels: verifiedChannels } = await getAIProxyChannels();
    const verifiedTargetChannels = verifiedChannels.filter((channel) => typeSet.has(channel.type));
    const remainingCount = verifiedTargetChannels.filter((channel) =>
      Object.entries(configPatch).some(([key, value]) => !Object.is(channel.configs?.[key], value))
    ).length;
    if (remainingCount > 0) {
      throw new Error(
        `${remainingCount} AI Proxy channels of type ${[...typeSet].join(',')} still require config updates`
      );
    }

    return {
      channelCount: verifiedTargetChannels.length,
      updatedCount: channelsToUpdate.length
    };
  });
