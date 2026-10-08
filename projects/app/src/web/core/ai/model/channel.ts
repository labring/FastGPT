import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import {
  type ChannelInfoType,
  type CreateChannelProps,
  type ChannelStatusEnum,
  REASONING_FIELD_MAPPING_CHANNEL_TYPES
} from '@fastgpt/global/core/ai/channel';
import type {
  AffectedModelsResponse,
  BatchDeleteChannelsResponse,
  ChannelListItem,
  ChannelModelsResponse,
  ChannelType,
  DeleteChannelResponse,
  GetChannelDashboardResponse,
  GetChannelLogDetailResponse,
  GetChannelLogsResponse,
  ListChannelsQuery,
  ListChannelsResponse,
  ProviderMetasResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';

const reasoningFieldMappingChannelTypes = new Set<number>(REASONING_FIELD_MAPPING_CHANNEL_TYPES);

const channelBasePath = '/core/ai/model/channel';

/**
 * 获取渠道分页列表。强制显式传递 channelType 作用域。
 */
export const getChannelPageList = (
  params: ListChannelsQuery & { channelType: ChannelType }
): Promise<ListChannelsResponse> => {
  return GET<ListChannelsResponse>(`${channelBasePath}/list`, params);
};

/**
 * 获取渠道列表。强制显式传递 channelType 作用域。
 */
export const getChannelList = (
  params: ListChannelsQuery & { channelType: ChannelType }
): Promise<ChannelListItem[]> => {
  return getChannelPageList(params).then((res) => {
    const list = [...(res?.list ?? [])];
    list.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0) || b.id - a.id);
    return list;
  });
};

/** 批量删除指定渠道 */
export const postBatchDeleteChannels = ({
  ids,
  channelType
}: {
  ids: number[];
  channelType: ChannelType;
}): Promise<BatchDeleteChannelsResponse> =>
  POST<BatchDeleteChannelsResponse>(`${channelBasePath}/batch`, {
    action: 'delete',
    ids,
    channelType
  });

/** 批量更新渠道启用/禁用状态 */
export const postBatchUpdateChannelStatus = ({
  ids,
  status,
  channelType
}: {
  ids: number[];
  status: 1 | 2;
  channelType: ChannelType;
}): Promise<void> =>
  POST<void>(`${channelBasePath}/batch`, {
    action: 'status',
    ids,
    status,
    channelType
  });

/** 获取渠道提供商协议默认配置与提示 */
export const getChannelProviders = () =>
  GET<ProviderMetasResponse>(`${channelBasePath}/providerMetas`);

/** FastGPT 渠道创建入口，重名校验由服务端统一执行 */
export const postCreateChannel = async (
  data: CreateChannelProps & { channelType: ChannelType; priority?: number }
): Promise<void> => {
  const channelType = data.channelType;
  const name = data.name.trim();

  return await POST<void>(`${channelBasePath}/create`, {
    channelType,
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
export const putChannelStatus = (id: number, status: ChannelStatusEnum, channelType: ChannelType) =>
  POST<void>(`${channelBasePath}/status`, {
    id,
    status: status as 1 | 2,
    channelType
  });

/** 更新渠道配置；空密钥表示保留服务端已有密钥。 */
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
  ) & { channelType: ChannelType }
) => {
  const channelType = data.channelType;

  return PUT<void>(`${channelBasePath}/update`, {
    id: data.id,
    channelType,
    type: data.type,
    name: data.name,
    base_url: data.base_url,
    models: data.models,
    model_mapping: data.model_mapping ?? undefined,
    configs: data.configs ?? undefined,
    ...(data.key ? { key: data.key } : {}),
    status: (data.status as 1 | 2) ?? undefined,
    priority: Math.max(data.priority ?? 1, 1),
    sets: data.sets ?? undefined
  });
};

/** 删除指定渠道 */
export const deleteChannel = (id: number, channelType: ChannelType) =>
  DELETE<DeleteChannelResponse>(`${channelBasePath}/delete`, {
    id,
    channelType
  });

/** 分页查询渠道调用日志 */
export const getChannelLog = (params: {
  channelType: ChannelType;
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
    channelType: params.channelType,
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

  return GET<GetChannelLogsResponse>(`${channelBasePath}/logs`, query);
};

/** 获取调用日志详情 */
export const getLogDetail = (id: number, channelType: ChannelType) =>
  GET<GetChannelLogDetailResponse>(`${channelBasePath}/logDetail`, {
    id,
    channelType
  });

/** 获取监控时序指标 */
export const getDashboardV2 = (params: {
  channelType: ChannelType;
  channelId?: number;
  channel?: number;
  model?: string;
  startTimestamp?: number;
  start_timestamp?: number;
  endTimestamp?: number;
  end_timestamp?: number;
  timezone: string;
  timespan: 'day' | 'hour' | 'minute';
}): Promise<GetChannelDashboardResponse> => {
  const query = {
    channelType: params.channelType,
    channelId: params.channelId ?? params.channel,
    model: params.model,
    startTimestamp: params.startTimestamp ?? params.start_timestamp,
    endTimestamp: params.endTimestamp ?? params.end_timestamp,
    timezone: params.timezone,
    timespan: params.timespan
  };

  return GET<GetChannelDashboardResponse>(`${channelBasePath}/dashboard`, query);
};

/** 查询删除渠道时受影响的独占模型（传入待检查的渠道 ID 列表） */
export const getAffectedModels = ({
  ids,
  channelType
}: {
  ids: number[];
  channelType: ChannelType;
}) =>
  GET<AffectedModelsResponse>(`${channelBasePath}/affectedModels`, {
    ids,
    channelType
  });

/** 获取指定渠道服务的全部模型（悬浮详情） */
export const getChannelModels = (id: number, channelType: ChannelType) =>
  GET<ChannelModelsResponse>(`${channelBasePath}/models`, {
    id,
    channelType
  });
