import { getModelProviderMetadata } from '../../core/app/provider/controller';
import { withAIProxyChannelMutation } from './lease';
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
    getModelProviderMetadata().aiproxyChannels.map((protocol) => [protocol.channelId, protocol])
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
 * 同步模型在 AI Proxy 渠道中的绑定。
 *
 * 1. 若 oldModel === newModel 且 channelIds === undefined，无需变动；
 * 2. 若 oldModel !== newModel 且 channelIds === undefined，将绑定了 oldModel 的渠道中的 oldModel 替换为 newModel；
 * 3. 若 channelIds !== undefined，将 newModel 绑定到指定渠道，并从指定渠道之外及所有原有绑定中移除 oldModel（若存在改名）。
 *
 * 渠道按顺序更新且不补偿已成功项，保持已确认的跨 AI Proxy 操作失败语义。
 */
export const syncModelInAIProxyChannels = async ({
  oldModel,
  newModel = oldModel,
  channelIds
}: {
  oldModel: string;
  newModel?: string;
  channelIds?: number[];
}) => {
  if (oldModel === newModel && channelIds === undefined) return;

  const isRenamed = oldModel !== newModel;
  const selectedIds = channelIds !== undefined ? new Set(channelIds) : undefined;

  return withAIProxyChannelMutation(async ({ signal, assertValid }) => {
    const { channels, baseUrl, headers } = await getAIProxyChannels();
    const channelMap = new Map(channels.map((channel) => [channel.id, channel]));

    if (selectedIds) {
      for (const channelId of selectedIds) {
        if (!channelMap.has(channelId)) {
          throw new Error(`AI Proxy channel does not exist: ${channelId}`);
        }
      }
    }

    const updates: Array<{ channel: AIProxyChannel; nextModels: string[] }> = [];

    for (const channel of channels) {
      let nextModels: string[];

      if (selectedIds !== undefined) {
        const shouldBind = selectedIds.has(channel.id);
        if (shouldBind) {
          if (!isRenamed) {
            nextModels = channel.models.includes(newModel)
              ? channel.models
              : [...channel.models, newModel];
          } else {
            if (channel.models.includes(oldModel)) {
              nextModels = [...new Set(channel.models.map((m) => (m === oldModel ? newModel : m)))];
            } else {
              nextModels = channel.models.includes(newModel)
                ? channel.models
                : [...channel.models, newModel];
            }
          }
        } else {
          const hasOld = channel.models.includes(oldModel);
          const hasNew = channel.models.includes(newModel);
          if (!hasOld && !hasNew) {
            nextModels = channel.models;
          } else {
            nextModels = channel.models.filter((m) => m !== oldModel && m !== newModel);
          }
        }
      } else {
        if (!channel.models.includes(oldModel)) continue;
        const replaced = channel.models.map((m) => (m === oldModel ? newModel : m));
        nextModels = [...new Set(replaced)];
      }

      const hasChanged =
        nextModels.length !== channel.models.length ||
        nextModels.some((m, idx) => m !== channel.models[idx]);

      if (hasChanged) {
        assertChannelUpdateSupported(channel);
        updates.push({ channel, nextModels });
      }
    }

    for (const { channel, nextModels } of updates) {
      assertValid();
      const { data: updateResponse } = await axiosWithoutSSRF.put(
        `${baseUrl}/api/channel/${channel.id}`,
        getChannelUpdateData(channel, nextModels),
        { headers, signal, timeout: 30000 }
      );
      AIProxyMutationResponseSchema.parse(updateResponse);
    }
  });
};

/**
 * 用目标渠道集合替换模型标识的绑定。兼容历史调用。
 */
export const replaceModelInAIProxyChannels = async ({
  model,
  channelIds
}: {
  model: string;
  channelIds: number[];
}) => {
  return syncModelInAIProxyChannels({ oldModel: model, newModel: model, channelIds });
};

/**
 * 从全部 AI Proxy 渠道中移除一组不可变模型标识。
 *
 * 删除模型时在 MongoDB 删除提交和缓存刷新后执行；解绑失败不恢复已经删除的模型。
 * 渠道按快照顺序更新且不补偿已成功项，与现有跨系统写入失败语义保持一致。
 */
export const removeModelsFromAIProxyChannels = async ({ models }: { models: string[] }) => {
  const modelSet = new Set(models);
  if (modelSet.size === 0) return;

  return withAIProxyChannelMutation(async ({ signal, assertValid }) => {
    const { channels, baseUrl, headers } = await getAIProxyChannels();

    for (const channel of channels) {
      if (channel.models.some((model) => modelSet.has(model)))
        assertChannelUpdateSupported(channel);
    }

    for (const channel of channels) {
      const nextModels = channel.models.filter((model) => !modelSet.has(model));
      if (nextModels.length === channel.models.length) continue;

      assertValid();
      const { data: updateResponse } = await axiosWithoutSSRF.put(
        `${baseUrl}/api/channel/${channel.id}`,
        getChannelUpdateData(channel, nextModels),
        { headers, signal, timeout: 30000 }
      );
      AIProxyMutationResponseSchema.parse(updateResponse);
    }
  });
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

  return withAIProxyChannelMutation(async ({ signal, assertValid }) => {
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

      assertValid();
      const { data: updateResponse } = await axiosWithoutSSRF.put(
        `${baseUrl}/api/channel/${channelId}`,
        getChannelUpdateData(channel, [...new Set([...channel.models, ...uniqueModels])]),
        { headers, signal, timeout: 30000 }
      );
      AIProxyMutationResponseSchema.parse(updateResponse);
    }
  });
};
