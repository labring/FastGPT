import {
  REASONING_FIELD_MAPPING_CHANNEL_TYPES,
  CHAT_UPSTREAM_PROTOCOL_CHANNEL_TYPES,
  type ChannelConfig
} from '@fastgpt/global/core/ai/model/channel';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { aiProxyClient } from '../../../../thirdProvider/aiproxy/client';
import { isAiproxyNotImplementedError } from '../../../../thirdProvider/aiproxy/error';
import type {
  BatchChannelBody,
  UpdateChannelBody,
  UpdateChannelStatusBody,
  ProviderMetasResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import type { UpdateChannelData } from '../../../../thirdProvider/aiproxy/type';
import { getCachedTypeMetas } from './cache';
import { resolveChannelForOperation, resolveChannelsForOperation } from './resolve';
import { getAiproxyClientByScope } from './client';
import { withChannelWriteLock } from './lock';
import { getChannelsAffectedModels } from './association';
import { getModelProviderMetadata } from '../provider/controller';

const getCachedChannelTypeMetas = () => getCachedTypeMetas(() => aiProxyClient.getTypeMetas());

/**
 * 合并上游表单配置与 Plugin 展示元数据，不返回实例渠道或密钥。
 * 展示元数据和顺序每次读取最新缓存；仅两边均存在的类型可创建，历史类型仍可展示。
 */
export const getChannelTypeMetas = async (): Promise<ProviderMetasResponse> => {
  const typeMetas = await getCachedChannelTypeMetas();
  const result: ProviderMetasResponse = Object.fromEntries(
    Object.entries(typeMetas).map(([id, meta]) => [
      id,
      {
        name: meta.name,
        defaultBaseUrl: meta.defaultBaseUrl,
        keyHelp: meta.keyHelp,
        canCreate: false
      }
    ])
  );

  for (const [order, channel] of (getModelProviderMetadata().aiproxyChannels ?? []).entries()) {
    const meta = typeMetas[channel.channelId];
    result[channel.channelId] = {
      name: meta?.name ?? channel.name.en,
      defaultBaseUrl: meta?.defaultBaseUrl ?? '',
      keyHelp: meta?.keyHelp ?? '',
      displayName: channel.name,
      avatar: channel.avatar,
      // 数字键对象会按 ID 遍历，显式保留原数组顺序供前端排序。
      order,
      // SDK 尚未声明官网字段，兼容 Plugin 响应中附带的字符串值。
      website:
        'website' in channel && typeof channel.website === 'string' ? channel.website : undefined,
      canCreate: meta !== undefined
    };
  }
  return result;
};

type ChannelScope = {
  channelType: ChannelType;
  tmbId: string;
};

type AffectedModel = { modelId: string; name: string; model: string };

/** 将上游不同版本的重名错误归一为平台错误码，普通更新与创建共用。 */
const isChannelNameConflictError = (error: unknown): boolean => {
  const msg =
    (error as { message?: string })?.message ??
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    '';
  return /duplicated|duplicate|already exists|conflict|已存在/i.test(msg);
};

/**
 * 校验渠道名称在当前分组/系统作用域内的唯一性。
 * 使用关键词搜索精准过滤候选集，避免全量拉取。
 */
const assertChannelNameUnique = async ({
  client,
  name,
  excludeId
}: {
  client: typeof aiProxyClient.system.channels;
  name: string;
  excludeId?: number;
}): Promise<void> => {
  const trimmedName = name.trim();
  const { channels = [] } = await client.list({ search: trimmedName });
  if (
    channels.some(
      (c: { id: number; name: string }) =>
        (excludeId === undefined || c.id !== excludeId) && c.name.trim() === trimmedName
    )
  ) {
    return Promise.reject(ModelErrEnum.channelNameConflict);
  }
};

/** 创建渠道；分组归属始终由当前会话成员推导，调用方不能传入 groupId。 */
export const createChannel = async ({
  channelType,
  tmbId,
  channelData
}: {
  channelType: ChannelType;
  tmbId: string;
  channelData: ChannelConfig;
}) => {
  const client = getAiproxyClientByScope({ channelType, tmbId }).channels;
  const data = {
    ...channelData,
    name: channelData.name.trim(),
    // 默认协议配置属于平台创建规则；调用方显式提供的配置（含 false）优先。
    configs: {
      ...(REASONING_FIELD_MAPPING_CHANNEL_TYPES.some((type) => type === channelData.type)
        ? { map_reasoning_to_reasoning_content: true }
        : {}),
      ...(CHAT_UPSTREAM_PROTOCOL_CHANNEL_TYPES.some((type) => type === channelData.type)
        ? { chat_upstream_protocol: 'auto' }
        : {}),
      ...channelData.configs
    }
  };
  await assertChannelNameUnique({ client, name: data.name });
  try {
    return await client.create(data);
  } catch (error) {
    if (isChannelNameConflictError(error)) {
      return Promise.reject(ModelErrEnum.channelNameConflict);
    }
    throw error;
  }
};

type UpdateChannelPatch = Omit<UpdateChannelBody, 'id' | 'channelType'>;

/** 更新渠道并统一处理 system/team 两种 AIProxy scope；与绑定变更共用单渠道写锁。 */
export const updateChannel = async ({
  id,
  channelType,
  tmbId,
  channelData
}: ChannelScope & { id: number; channelData: UpdateChannelPatch }): Promise<void> => {
  const { addModels, removeModels, setModelMapping, removeModelMappingKeys, ...baseChannelData } =
    channelData;
  const hasModelsDelta = addModels !== undefined || removeModels !== undefined;
  const hasMappingDelta = setModelMapping !== undefined || removeModelMappingKeys !== undefined;

  if (
    (baseChannelData.models !== undefined && hasModelsDelta) ||
    (baseChannelData.model_mapping !== undefined && hasMappingDelta)
  ) {
    return Promise.reject(ModelErrEnum.invalidModelConfig);
  }

  // 无任何有效修改字段时只校验渠道归属，不占写锁也不下发无意义 PUT。
  const hasAnyUpdateField = Object.values(channelData).some((value) => value !== undefined);
  if (!hasAnyUpdateField) {
    await resolveChannelForOperation({ id, channelType, tmbId });
    return;
  }

  await withChannelWriteLock({
    channelId: id,
    channelType,
    tmbId,
    fn: async ({ assertValid }) => {
      const channel = await resolveChannelForOperation({ id, channelType, tmbId });
      const client = getAiproxyClientByScope({ channelType, tmbId }).channels;

      if (baseChannelData.name) {
        await assertChannelNameUnique({ client, name: baseChannelData.name, excludeId: id });
      }

      const aiproxyPatch: UpdateChannelData = {
        ...(baseChannelData.name !== undefined && { name: baseChannelData.name }),
        ...(baseChannelData.type !== undefined && { type: baseChannelData.type }),
        ...(baseChannelData.key !== undefined && { key: baseChannelData.key }),
        ...(baseChannelData.base_url !== undefined && { base_url: baseChannelData.base_url }),
        ...(baseChannelData.models !== undefined && { models: baseChannelData.models }),
        ...(baseChannelData.model_mapping !== undefined && {
          model_mapping: baseChannelData.model_mapping
        }),
        ...(baseChannelData.priority !== undefined && { priority: baseChannelData.priority }),
        ...(baseChannelData.status !== undefined && { status: baseChannelData.status }),
        ...(baseChannelData.sets !== undefined && { sets: baseChannelData.sets }),
        // 列表仅返回可公开配置；修改协议时不能覆盖 AIProxy 中其他高级配置。
        ...(baseChannelData.configs !== undefined && {
          configs: { ...channel.configs, ...baseChannelData.configs }
        })
      };

      // 模型列表与映射增删基于锁内最新快照合并，避免过期表单擦除并发导入或手动绑定。
      if (hasModelsDelta) {
        const currentModels = channel.models ?? [];
        const addList = Array.from(new Set(addModels ?? []));
        const addSet = new Set(addList);
        const removeSet = new Set((removeModels ?? []).filter((model) => !addSet.has(model)));
        const keptModels = currentModels.filter((model) => !removeSet.has(model));
        const keptSet = new Set(keptModels);
        const nextModels = [...keptModels, ...addList.filter((model) => !keptSet.has(model))];
        const modelsChanged =
          nextModels.length !== currentModels.length ||
          nextModels.some((model, index) => model !== currentModels[index]);
        if (modelsChanged) {
          aiproxyPatch.models = nextModels;
        }
      }

      if (hasMappingDelta) {
        const currentMapping = channel.model_mapping ?? {};
        const removeKeySet = new Set(removeModelMappingKeys ?? []);
        const setEntries = Object.entries(setModelMapping ?? {});
        const setKeySet = new Set(setEntries.map(([key]) => key));
        const nextMapping = Object.fromEntries([
          ...Object.entries(currentMapping).filter(
            ([key]) => !removeKeySet.has(key) && !setKeySet.has(key)
          ),
          ...setEntries
        ]);
        const currentKeys = Object.keys(currentMapping);
        const nextKeys = Object.keys(nextMapping);
        const mappingChanged =
          currentKeys.length !== nextKeys.length ||
          nextKeys.some(
            (key) => !Object.hasOwn(currentMapping, key) || currentMapping[key] !== nextMapping[key]
          );
        if (mappingChanged) {
          aiproxyPatch.model_mapping = nextMapping;
        }
      }

      if (Object.keys(aiproxyPatch).length === 0) return;

      assertValid();
      try {
        await client.update(id, aiproxyPatch);
      } catch (error) {
        if (isChannelNameConflictError(error)) {
          return Promise.reject(ModelErrEnum.channelNameConflict);
        }
        throw error;
      }
    }
  });
};

/** 切换渠道状态。 */
export const updateChannelStatus = async ({
  id,
  status,
  channelType,
  tmbId
}: UpdateChannelStatusBody & Pick<ChannelScope, 'tmbId'>): Promise<void> => {
  await resolveChannelForOperation({ id, channelType, tmbId });
  await getAiproxyClientByScope({ channelType, tmbId }).channels.updateStatus(id, status);
};

/** 删除已校验归属的渠道，删除前按 teamId 读取模型目录并计算失去全部可用渠道的模型。 */
export const deleteChannel = async ({
  id,
  channelType,
  tmbId,
  teamId
}: ChannelScope & {
  id: number;
  teamId: string;
}): Promise<{
  affectedModels: AffectedModel[];
}> => {
  const channel = await resolveChannelForOperation({ id, channelType, tmbId });
  const affectedModels = await getChannelsAffectedModels({
    channels: [channel],
    channelType,
    teamId,
    tmbId
  });
  await getAiproxyClientByScope({ channelType, tmbId }).channels.delete(id);
  return { affectedModels };
};

/** 批量操作已校验归属的渠道；删除前计算模型影响，状态切换无需读取模型目录。 */
export const batchOperateChannels = async ({
  body,
  tmbId,
  teamId
}: {
  body: BatchChannelBody;
  tmbId: string;
  teamId: string;
}): Promise<{ affectedModels?: AffectedModel[] }> => {
  const { channelType } = body;
  const channels = await resolveChannelsForOperation({ ids: body.ids, channelType, tmbId });
  const client = getAiproxyClientByScope({ channelType, tmbId }).channels;
  if (body.action === 'delete') {
    const affectedModels = await getChannelsAffectedModels({
      channels,
      channelType,
      teamId,
      tmbId
    });
    await client.batchDelete(body.ids);
    return { affectedModels };
  }

  await client.batchUpdateStatus(body.ids, body.status);
  return {};
};

/**
 * 读取导入预览所需的渠道快照、上游模型目录和渠道协议名。
 * 501 目录不支持错误在渠道层统一归一化为业务错误；type-meta 仅用于推断 provider，失败时降级为空。
 */
export const getChannelCatalogForImport = async ({
  channelId,
  channelType,
  tmbId
}: ChannelScope & { channelId: number }) => {
  const scope = { channelType, tmbId };
  const channel = await resolveChannelForOperation({ id: channelId, ...scope });
  const { channels } = getAiproxyClientByScope(scope);
  const [channelModels, typeMetas] = await Promise.all([
    channels.getModelCatalog(channelId).catch((error) => {
      if (isAiproxyNotImplementedError(error)) {
        throw new UserError(ModelErrEnum.channelCatalogUnsupported);
      }
      throw error;
    }),
    getCachedChannelTypeMetas().catch(() => undefined)
  ]);

  return {
    channel,
    channelModels,
    channelTypeName: typeMetas?.[channel.type]?.name
  };
};
