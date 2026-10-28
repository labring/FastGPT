import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import { type ChannelStatusType } from '@fastgpt/global/core/ai/model/channel';
import type {
  CreateChannelBody,
  CreateChannelResponse,
  UpdateChannelBody,
  GetChannelLogsQuery,
  GetChannelDashboardQuery,
  AffectedModelsResponse,
  BatchDeleteChannelsResponse,
  ChannelListItem,
  ChannelModelsResponse,
  DeleteChannelResponse,
  GetChannelDashboardResponse,
  GetChannelLogDetailResponse,
  GetChannelLogsResponse,
  ListChannelsQuery,
  ListChannelsResponse,
  ProviderMetasResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import { PaginationPageSizeLimit } from '@fastgpt/global/openapi/api';

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
 * 获取筛选器所需的全部渠道，按接口上限逐页读取，避免默认分页截断候选项。
 * 显式分页使用 getChannelPageList；保留同一作用域、搜索条件和创建时间排序。
 */
export const getChannelList = async (
  params: Pick<ListChannelsQuery, 'search'> & { channelType: ChannelType }
): Promise<ChannelListItem[]> => {
  const list: ChannelListItem[] = [];
  for (let pageNum = 1; ; pageNum++) {
    const page = await getChannelPageList({
      ...params,
      pageNum,
      pageSize: PaginationPageSizeLimit
    });
    list.push(...page.list);
    // 查询期间资源可能被删除，空页时结束，避免仅依赖旧 total 持续请求。
    if (page.list.length === 0 || list.length >= page.total) break;
  }
  return list.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0) || b.id - a.id);
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

/** 按需获取渠道类型的展示信息、表单默认配置与创建能力。 */
export const getChannelProviders = () =>
  GET<ProviderMetasResponse>(`${channelBasePath}/providerMetas`);

/** FastGPT 渠道创建入口，重名校验由服务端统一执行 */
export const postCreateChannel = (data: CreateChannelBody): Promise<CreateChannelResponse> =>
  POST<CreateChannelResponse>(`${channelBasePath}/create`, data);

/** 更新单个渠道启用/禁用状态 */
export const putChannelStatus = (id: number, status: ChannelStatusType, channelType: ChannelType) =>
  POST<void>(`${channelBasePath}/status`, {
    id,
    status,
    channelType
  });

/** 更新渠道配置；空密钥表示保留服务端已有密钥。 */
export const putChannel = ({ key, ...data }: UpdateChannelBody) =>
  PUT<void>(`${channelBasePath}/update`, {
    ...data,
    ...(key ? { key } : {}),
    ...(data.priority !== undefined && { priority: Math.max(data.priority, 1) })
  });

/** 删除指定渠道 */
export const deleteChannel = (id: number, channelType: ChannelType) =>
  DELETE<DeleteChannelResponse>(`${channelBasePath}/delete`, {
    id,
    channelType
  });

/** 分页查询渠道调用日志 */
export const getChannelLog = (params: GetChannelLogsQuery) =>
  GET<GetChannelLogsResponse>(`${channelBasePath}/logs`, params);

/** 获取调用日志详情 */
export const getLogDetail = (id: number, channelType: ChannelType) =>
  GET<GetChannelLogDetailResponse>(`${channelBasePath}/logDetail`, {
    id,
    channelType
  });

/** 获取监控时序指标 */
export const getDashboardV2 = (
  params: GetChannelDashboardQuery
): Promise<GetChannelDashboardResponse> =>
  GET<GetChannelDashboardResponse>(`${channelBasePath}/dashboard`, params);

/** 查询删除渠道时受影响的独占模型（传入待检查的渠道 ID 列表） */
export const getAffectedModels = ({
  ids,
  channelType
}: {
  ids: number[];
  channelType: ChannelType;
}) =>
  GET<AffectedModelsResponse>(`${channelBasePath}/affectedModels`, {
    ids: ids.join(','),
    channelType
  });

/** 获取指定渠道服务的全部模型（悬浮详情） */
export const getChannelModels = (id: number, channelType: ChannelType) =>
  GET<ChannelModelsResponse>(`${channelBasePath}/models`, {
    id,
    channelType
  });
