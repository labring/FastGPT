import { axiosWithoutSSRF } from '@fastgpt/service/common/api/axios';
import { getAIProxyAdminConfig } from '@fastgpt/service/thirdProvider/aiproxy/config';
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
 * AI Proxy 渠道更新为 Patch 语义，因此仅向接口提交增量 configs，
 * 避免使用旧快照全量覆写 models、key 等并发可能变更的字段。
 */
export const mergeAIProxyChannelConfigs = async ({
  channelTypes,
  configPatch,
  beforeUpdate
}: {
  channelTypes: number | readonly number[] | number[];
  configPatch: Record<string, string | number | boolean | null>;
  beforeUpdate: () => Promise<void>;
}) => {
  const controller = new AbortController();
  const signal = controller.signal;
  const typeSet = new Set(Array.isArray(channelTypes) ? channelTypes : [channelTypes as number]);
  const { channels, baseUrl, headers } = await getAIProxyChannels();
  const targetChannels = channels.filter((channel) => typeSet.has(channel.type));
  const channelsToUpdate = targetChannels.filter((channel) =>
    Object.entries(configPatch).some(([key, value]) => !Object.is(channel.configs?.[key], value))
  );

  for (const channel of channelsToUpdate) {
    await beforeUpdate();
    const { data: updateResponse } = await axiosWithoutSSRF.put(
      `${baseUrl}/api/channel/${channel.id}`,
      {
        configs: {
          ...(channel.configs ?? {}),
          ...configPatch
        }
      },
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
};
