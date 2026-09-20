import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import {
  type DashboardDataItemType,
  type ChannelInfoType,
  type CreateChannelProps,
  DashboardDataItemSchema
} from '@/global/aiproxy/type';
import type { ChannelStatusEnum } from '@/global/aiproxy/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { REASONING_FIELD_MAPPING_CHANNEL_TYPES } from '@fastgpt/global/core/ai/channel';
import { useUserStore } from '@/web/support/user/useUserStore';
import type {
  AffectedModelsResponse,
  BatchDeleteChannelsResponse,
  BatchUpdateChannelStatusResponse,
  ChannelListItem,
  ChannelModelsResponse,
  CreateChannelResponse,
  DeleteChannelResponse,
  GetChannelDashboardResponse,
  GetChannelLogDetailResponse,
  GetChannelLogsResponse,
  ListChannelsQuery,
  ListChannelsResponse,
  ModelChannelsResponse,
  ProviderMetasResponse,
  TestChannelResponse,
  UpdateChannelResponse,
  UpdateChannelStatusResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

const reasoningFieldMappingChannelTypes = new Set<number>(REASONING_FIELD_MAPPING_CHANNEL_TYPES);

/**
 * 默认渠道范围解析：root 默认系统渠道视图，成员默认本人团队渠道视图
 */
const getDefaultChannelScope = (): 'system' | 'team' =>
  useUserStore.getState().userInfo?.username === 'root' ? 'system' : 'team';

/**
 * 获取渠道列表。
 * 根据当前用户角色默认拉取对应视图（root 默认 system 系统渠道，成员默认 team 专属渠道）。
 */
export const getChannelList = (params?: ListChannelsQuery): Promise<ChannelListItem[]> => {
  const query: ListChannelsQuery = {
    groupType: getDefaultChannelScope(),
    ...params
  };

  return GET<ListChannelsResponse>('/core/ai/channel/list', query).then((res) => {
    const list = [...(res?.list ?? [])];
    list.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0) || b.id - a.id);
    return list;
  });
};

/** 获取渠道提供商协议默认配置与提示 */
export const getChannelProviders = () =>
  GET<ProviderMetasResponse>('/core/ai/channel/providerMetas');

/** FastGPT 渠道创建入口，创建前在目标 scope 内按展示名称检查重复 */
export const postCreateChannel = async (
  data: CreateChannelProps & { groupType?: 'system' | 'team'; priority?: number }
): Promise<void> => {
  const groupType = data.groupType ?? getDefaultChannelScope();
  const name = data.name.trim();
  const channels = await getChannelList({ groupType });
  if (channels.some((channel) => channel.name.trim() === name)) {
    return Promise.reject(i18nT('config_model:channel_name_duplicate'));
  }

  await POST<CreateChannelResponse>('/core/ai/channel/create', {
    groupType,
    type: data.type,
    name,
    base_url: data.base_url,
    models: data.models,
    model_mapping: data.model_mapping,
    configs: reasoningFieldMappingChannelTypes.has(data.type)
      ? { map_reasoning_to_reasoning_content: true }
      : undefined,
    key: data.key ?? '',
    priority: data.priority ?? 1
  });
};

/** 更新单个渠道启用/禁用状态 */
export const putChannelStatus = (
  id: number,
  status: ChannelStatusEnum,
  channelType?: 'system' | 'team'
) =>
  POST<UpdateChannelStatusResponse>('/core/ai/channel/status', {
    id,
    status: status as 1 | 2,
    channelType: channelType ?? getDefaultChannelScope()
  });

/** 完整更新渠道配置 */
export const putChannel = (
  data: (
    | ChannelInfoType
    | (Partial<ChannelInfoType> & {
        id: number;
        name: string;
        type: number;
        key?: string;
        models: string[];
      })
  ) & { channelType?: 'system' | 'team' }
) => {
  const channelType = data.channelType ?? getDefaultChannelScope();

  if (data.balance_threshold !== undefined && data.balance_threshold !== 0) {
    return Promise.reject(
      new Error(`AI Proxy v0.6.5 cannot preserve balance_threshold for channel: ${data.id}`)
    );
  }

  return PUT<UpdateChannelResponse>('/core/ai/channel/update', {
    id: data.id,
    channelType,
    type: data.type,
    name: data.name,
    base_url: data.base_url,
    proxy_url: data.proxy_url,
    models: data.models,
    model_mapping: data.model_mapping ?? undefined,
    configs: data.configs ?? undefined,
    key: data.key ?? '',
    status: (data.status as 1 | 2) ?? undefined,
    priority: Math.max(data.priority ?? 1, 1),
    sets: data.sets ?? undefined
  });
};

/** 删除指定渠道 */
export const deleteChannel = (id: number, channelType?: 'system' | 'team') =>
  DELETE<DeleteChannelResponse>('/core/ai/channel/delete', {
    id,
    channelType: channelType ?? getDefaultChannelScope()
  });

/** 批量删除渠道 */
export const batchDeleteChannels = (ids: number[], channelType?: 'system' | 'team') =>
  POST<BatchDeleteChannelsResponse>('/core/ai/channel/batchDelete', {
    ids,
    channelType: channelType ?? getDefaultChannelScope()
  });

/** 批量启停渠道 */
export const batchUpdateChannelStatus = (
  ids: number[],
  status: 1 | 2,
  channelType?: 'system' | 'team'
) =>
  POST<BatchUpdateChannelStatusResponse>('/core/ai/channel/batchStatus', {
    ids,
    status,
    channelType: channelType ?? getDefaultChannelScope()
  });

/** 分页查询渠道调用日志 */
export const getChannelLog = (params: {
  channelType?: 'system' | 'team';
  requestId?: string;
  request_id?: string;
  channelId?: string | number;
  channel?: string | number;
  modelName?: string;
  model_name?: string;
  codeType?: 'all' | 'success' | 'error';
  code_type?: 'all' | 'success' | 'error';
  startTimestamp?: number;
  start_timestamp?: number;
  endTimestamp?: number;
  end_timestamp?: number;
  offset?: number;
  pageNum?: number;
  pageSize?: number;
}) => {
  const query = {
    channelType: params.channelType ?? getDefaultChannelScope(),
    requestId: params.requestId ?? params.request_id,
    channelId:
      params.channelId !== undefined
        ? Number(params.channelId) || undefined
        : params.channel !== undefined
          ? Number(params.channel) || undefined
          : undefined,
    modelName: params.modelName ?? params.model_name,
    codeType: params.codeType ?? params.code_type,
    startTimestamp: params.startTimestamp ?? params.start_timestamp ?? 0,
    endTimestamp: params.endTimestamp ?? params.end_timestamp ?? Date.now(),
    pageNum:
      params.pageNum ??
      (params.offset !== undefined && params.pageSize
        ? Math.floor(params.offset / params.pageSize) + 1
        : 1),
    pageSize: params.pageSize ?? 20
  };

  return GET<GetChannelLogsResponse>('/core/ai/channel/logs', query);
};

/** 获取调用日志详情 */
export const getLogDetail = (id: number, channelType?: 'system' | 'team') =>
  GET<GetChannelLogDetailResponse>('/core/ai/channel/logDetail', {
    id,
    channelType: channelType ?? getDefaultChannelScope()
  });

/** 获取监控时序指标 */
export const getDashboardV2 = (params: {
  channelType?: 'system' | 'team';
  channelId?: number;
  channel?: number;
  model?: string;
  startTimestamp?: number;
  start_timestamp?: number;
  endTimestamp?: number;
  end_timestamp?: number;
  timezone: string;
  timespan: 'day' | 'hour' | 'minute';
}): Promise<{ timestamp: number; summary: DashboardDataItemType[] }[]> => {
  const query = {
    channelType: params.channelType ?? getDefaultChannelScope(),
    channelId: params.channelId ?? params.channel,
    model: params.model,
    startTimestamp: params.startTimestamp ?? params.start_timestamp,
    endTimestamp: params.endTimestamp ?? params.end_timestamp,
    timezone: params.timezone,
    timespan: params.timespan
  };

  return GET<GetChannelDashboardResponse>('/core/ai/channel/dashboard', query).then((res) =>
    res.map((item) => ({
      ...item,
      summary: item.summary.map((summaryItem) => DashboardDataItemSchema.parse(summaryItem))
    }))
  );
};

/** 单渠道模型探活测试 */
export const getTestChannel = (data: {
  id: number;
  model: string;
  channelType?: 'system' | 'team';
}) =>
  GET<TestChannelResponse>('/core/ai/channel/test', {
    id: data.id,
    model: data.model,
    channelType: data.channelType ?? getDefaultChannelScope()
  });

/** 查询删除渠道时受影响的独占模型 */
export const getAffectedModels = (id: number, channelType?: 'system' | 'team') =>
  GET<AffectedModelsResponse>('/core/ai/channel/affectedModels', {
    id,
    channelType: channelType ?? getDefaultChannelScope()
  });

/** 获取指定渠道服务的全部模型（悬浮详情） */
export const getChannelModels = (id: number, channelType?: 'system' | 'team') =>
  GET<ChannelModelsResponse>('/core/ai/channel/models', {
    id,
    channelType: channelType ?? getDefaultChannelScope()
  });

/** 获取指定模型关联的全部渠道（悬浮详情） */
export const getModelChannels = (modelId: string) =>
  GET<ModelChannelsResponse>('/core/ai/channel/modelChannels', { modelId });
