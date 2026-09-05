import { z } from 'zod';
import { axiosWithoutSSRF } from '../../common/api/axios';
import { getAIProxyAdminConfig } from './config';

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

const getChannelUpdateData = (channel: AIProxyChannel, models: string[]) => {
  assertChannelUpdateSupported(channel);

  return {
    type: channel.type,
    name: channel.name,
    base_url: channel.base_url,
    proxy_url: channel.proxy_url,
    model_mapping: channel.model_mapping,
    configs: channel.configs,
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

/** 读取 AI Proxy 的完整渠道列表，供服务端聚合模型与渠道关系。 */
export const getAIProxyChannelList = async () => {
  const { channels } = await getAIProxyChannels();
  return channels;
};

/**
 * 聚合管理员模型界面需要的渠道展示信息。
 *
 * 名称和状态来自 AI Proxy，协议名称与图标来自 Plugin 缓存；结果统一按创建时间倒序，
 * 保证模型列表、详情弹窗、关联弹窗与渠道管理页看到相同的渠道顺序。
 */
export const getAdminAIProxyChannelItems = async () => {
  const channels = await getAIProxyChannelList();
  const protocolMap = new Map(
    global.aiproxyChannelsCache.map((protocol) => [protocol.channelId, protocol])
  );

  return [...channels]
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0) || b.id - a.id)
    .map((channel) => {
      const protocol = protocolMap.get(channel.type);

      return {
        models: channel.models,
        summary: {
          id: channel.id,
          name: channel.name,
          protocol: protocol
            ? { name: protocol.name, avatar: protocol.avatar }
            : {
                name: {
                  en: String(channel.type),
                  'zh-CN': String(channel.type),
                  'zh-Hant': String(channel.type)
                },
                avatar: ''
              },
          status: channel.status ?? 0
        }
      };
    });
};

/**
 * 用目标渠道集合替换不可变模型标识的绑定。
 *
 * 渠道按顺序更新且不补偿已成功项，保持已确认的跨 AI Proxy 操作失败语义。
 */
export const replaceModelInAIProxyChannels = async ({
  model,
  channelIds
}: {
  model: string;
  channelIds: number[];
}) => {
  const selectedIds = new Set(channelIds);
  const { channels, baseUrl, headers } = await getAIProxyChannels();
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));

  for (const channelId of selectedIds) {
    if (!channelMap.has(channelId)) {
      throw new Error(`AI Proxy channel does not exist: ${channelId}`);
    }
  }

  // 所有可提前识别的不兼容都必须在第一次外部写入前失败。
  for (const channel of channels) {
    const shouldBind = selectedIds.has(channel.id);
    if (shouldBind !== channel.models.includes(model)) assertChannelUpdateSupported(channel);
  }

  for (const channel of channels) {
    const shouldBind = selectedIds.has(channel.id);
    const hasModel = channel.models.includes(model);
    if (shouldBind === hasModel) continue;

    const nextModels = shouldBind
      ? [...new Set([...channel.models, model])]
      : channel.models.filter((channelModel) => channelModel !== model);

    const { data: updateResponse } = await axiosWithoutSSRF.put(
      `${baseUrl}/api/channel/${channel.id}`,
      getChannelUpdateData(channel, nextModels),
      { headers }
    );
    AIProxyMutationResponseSchema.parse(updateResponse);
  }
};

/**
 * 从全部 AI Proxy 渠道中移除一组不可变模型标识。
 *
 * 删除模型时先执行该外部写入，再删除 MongoDB 记录，避免解绑失败后留下新的悬空渠道绑定。
 * 渠道按快照顺序更新且不补偿已成功项，与现有跨系统写入失败语义保持一致。
 */
export const removeModelsFromAIProxyChannels = async ({ models }: { models: string[] }) => {
  const modelSet = new Set(models);
  if (modelSet.size === 0) return;

  const { channels, baseUrl, headers } = await getAIProxyChannels();

  for (const channel of channels) {
    if (channel.models.some((model) => modelSet.has(model))) assertChannelUpdateSupported(channel);
  }

  for (const channel of channels) {
    const nextModels = channel.models.filter((model) => !modelSet.has(model));
    if (nextModels.length === channel.models.length) continue;

    const { data: updateResponse } = await axiosWithoutSSRF.put(
      `${baseUrl}/api/channel/${channel.id}`,
      getChannelUpdateData(channel, nextModels),
      { headers }
    );
    AIProxyMutationResponseSchema.parse(updateResponse);
  }
};

/**
 * 把模型标识追加到指定 AI Proxy 渠道。
 *
 * 渠道按顺序逐个提交；任一渠道失败立即终止，之前成功的渠道不回滚。这与模型创建的
 * 已确认跨系统失败语义一致：只有所有渠道绑定成功后，调用方才可以开始 MongoDB 事务。
 */
export const appendModelsToAIProxyChannels = async ({
  channelIds,
  models
}: {
  channelIds: number[];
  models: string[];
}) => {
  const uniqueChannelIds = [...new Set(channelIds)];
  const uniqueModels = [...new Set(models)];
  if (uniqueChannelIds.length === 0 || uniqueModels.length === 0) return;

  const { channels, baseUrl, headers } = await getAIProxyChannels();
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));

  // 先校验完整目标集合，避免后面的无效 ID 让前面渠道已被部分写入。
  for (const channelId of uniqueChannelIds) {
    if (!channelMap.has(channelId)) {
      throw new Error(`AI Proxy channel does not exist: ${channelId}`);
    }
  }

  for (const channelId of uniqueChannelIds) {
    assertChannelUpdateSupported(channelMap.get(channelId)!);
  }

  for (const channelId of uniqueChannelIds) {
    const channel = channelMap.get(channelId)!;

    const { data: updateResponse } = await axiosWithoutSSRF.put(
      `${baseUrl}/api/channel/${channelId}`,
      getChannelUpdateData(channel, [...new Set([...channel.models, ...uniqueModels])]),
      { headers }
    );
    AIProxyMutationResponseSchema.parse(updateResponse);
  }
};
