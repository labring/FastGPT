import { axiosWithoutSSRF } from '../../../common/api/axios';
import { getAIProxyAdminConfig } from '../../../thirdProvider/aiproxy/config';
import type {
  ChannelDashboardPoint,
  ChannelLogListItem,
  GetChannelDashboardQuery,
  GetChannelLogDetailResponse,
  GetChannelLogsQuery,
  GetChannelLogsResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';
import { getCachedTypeMetas } from './cache';

/**
 * aiproxy admin API typed client (design §2.9.1) — direct transparent pagination.
 *
 * aiproxy is the single source of truth for channels — FastGPT keeps no local
 * channel collection. Every call uses the admin bearer token from
 * `getAIProxyAdminConfig()` (serviceEnv.AIPROXY_API_ENDPOINT / AIPROXY_API_TOKEN)
 * and unwraps the `{ success, message, data }` envelope; a non-success envelope
 * or an HTTP error throws so callers can normalize via controller#normalizeAiproxyError.
 *
 * Direct transparent pagination (design §2.3):
 * - Reads forward page, per_page, search directly to aiproxy.
 * - Zero multi-instance cache drift, zero memory hoarding.
 */

export const AIPROXY_LIST_PAGE_SIZE = 100; // aiproxy caps per_page at 100

export type ChannelStatus = 1 | 2; // 1 = 启用, 2 = 禁用

/** Raw system channel (aiproxy ChannelResponse) */
export type AiproxyChannel = {
  id: number;
  name: string;
  type: number;
  key?: string;
  base_url?: string;
  models: string[];
  model_mapping?: Record<string, string>;
  priority?: number;
  status: ChannelStatus;
  sets?: string[];
  configs?: Record<string, unknown>;
  used_amount?: number;
  request_count?: number;
  retry_count?: number;
  balance?: number;
  created_at?: number;
  accessed_at?: number;
};

/** Raw member channel (aiproxy GroupChannelResponse) — system channel fields + group_id */
export type AiproxyGroupChannel = AiproxyChannel & {
  group_id: string;
};

/** Write payload (aiproxy AddChannelRequest) */
export type AddChannelData = {
  name: string;
  type: number;
  key: string;
  base_url?: string;
  models: string[];
  model_mapping?: Record<string, string>;
  priority?: number;
  status?: ChannelStatus;
  sets?: string[];
  configs?: Record<string, unknown>;
};

export type ChannelListResult<T = AiproxyChannel> = {
  channels: T[];
  total: number;
};

export type ChannelListParams = {
  page?: number;
  perPage?: number;
  search?: string;
};

type AiproxyEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

/**
 * Call an aiproxy admin endpoint. Throws on HTTP errors or when the envelope
 * reports `success: false` (message preserved for error normalization).
 */
const request = async <T>(
  method: 'get' | 'post' | 'put' | 'delete',
  url: string,
  body?: unknown
): Promise<T> => {
  const { baseUrl, token } = getAIProxyAdminConfig();

  const res = await axiosWithoutSSRF({
    method,
    url: `${baseUrl}${url}`,
    data: body,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000
  });

  const envelope = res.data as AiproxyEnvelope<T>;
  if (envelope.success === false) {
    throw new Error(envelope.message || 'aiproxy request failed');
  }
  return envelope.data as T;
};

const get = <T>(url: string) => request<T>('get', url);
const post = <T>(url: string, body?: unknown) => request<T>('post', url, body);
const put = <T>(url: string, body?: unknown) => request<T>('put', url, body);
const del = <T>(url: string) => request<T>('delete', url);

const toListParams = ({ page, perPage, search }: ChannelListParams) => {
  const params = new URLSearchParams();
  if (page) params.set('page', String(page));
  if (perPage) params.set('per_page', String(perPage));
  if (search) params.set('search', search);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

const normalizeListResult = <T>(data?: ChannelListResult<T>): ChannelListResult<T> => {
  if (!data || !data.channels) {
    return { channels: [], total: 0 };
  }
  return {
    channels: data.channels,
    total: data.total ?? data.channels.length
  };
};

/* ═══ Direct paginated reads (transparent passthrough to aiproxy) ═══ */

export const listSystemChannels = async ({
  page,
  perPage,
  search
}: ChannelListParams = {}): Promise<ChannelListResult> =>
  normalizeListResult(
    await get<ChannelListResult>(`/api/channels/${toListParams({ page, perPage, search })}`)
  );

export const listGroupChannels = async (
  groupId: string,
  { page, perPage, search }: ChannelListParams = {}
): Promise<ChannelListResult<AiproxyGroupChannel>> =>
  normalizeListResult(
    await get<ChannelListResult<AiproxyGroupChannel>>(
      `/api/group/${encodeURIComponent(groupId)}/channels/${toListParams({ page, perPage, search })}`
    )
  );

export const listGlobalGroupChannels = async ({
  groupId,
  page,
  perPage,
  search
}: ChannelListParams & { groupId?: string } = {}): Promise<
  ChannelListResult<AiproxyGroupChannel>
> => {
  const params = new URLSearchParams();
  if (groupId) params.set('group', groupId);
  if (page) params.set('page', String(page));
  if (perPage) params.set('per_page', String(perPage));
  if (search) params.set('search', search);
  const qs = params.toString();
  return normalizeListResult(
    await get<ChannelListResult<AiproxyGroupChannel>>(`/api/group_channels/${qs ? `?${qs}` : ''}`)
  );
};

/* ═══ Realtime fetch loops (used exclusively for delete-protection analysis and model pairing) ═══ */

export const listAllSystemChannels = async (): Promise<AiproxyChannel[]> => {
  const all: AiproxyChannel[] = [];
  let page = 1;
  for (;;) {
    const { channels, total } = await listSystemChannels({
      page,
      perPage: AIPROXY_LIST_PAGE_SIZE
    });
    if (!Array.isArray(channels)) break;
    all.push(...channels);
    if (channels.length === 0 || all.length >= total) break;
    page += 1;
  }
  return all;
};

export const listAllGroupChannels = async (groupId: string): Promise<AiproxyGroupChannel[]> => {
  const all: AiproxyGroupChannel[] = [];
  let page = 1;
  for (;;) {
    const { channels, total } = await listGroupChannels(groupId, {
      page,
      perPage: AIPROXY_LIST_PAGE_SIZE
    });
    if (!Array.isArray(channels)) break;
    all.push(...channels);
    if (channels.length === 0 || all.length >= total) break;
    page += 1;
  }
  return all;
};

export const getRealtimeSystemChannels = (): Promise<AiproxyChannel[]> => listAllSystemChannels();
export const getRealtimeGroupChannels = (groupId: string): Promise<AiproxyGroupChannel[]> =>
  listAllGroupChannels(groupId);

/**
 * Single-fetch a system channel by id.
 */
export const getSystemChannelById = (id: number): Promise<AiproxyChannel> =>
  get<AiproxyChannel>(`/api/channel/${id}`);

export const createSystemChannel = async (data: AddChannelData): Promise<void> => {
  await post<void>(`/api/channel/`, data);
};

export const updateSystemChannel = async (id: number, data: AddChannelData): Promise<void> => {
  await put<void>(`/api/channel/${id}`, data);
};

export const deleteSystemChannel = async (id: number): Promise<void> => {
  await del<void>(`/api/channel/${id}`);
};

export const updateSystemChannelStatus = async (
  id: number,
  status: ChannelStatus
): Promise<void> => {
  await post<void>(`/api/channel/${id}/status`, { status });
};

/**
 * Test one model on a channel.
 */
export const testSystemChannel = async (id: number, model: string): Promise<void> => {
  await get<void>(`/api/channel/${id}/test/${encodeURIComponent(model)}`);
};

/* ═══ Member channels (group-scoped) ═══ */

/** Single-fetch a member channel inside its own group */
export const getGroupChannelById = (groupId: string, id: number): Promise<AiproxyGroupChannel> =>
  get<AiproxyGroupChannel>(`/api/group/${encodeURIComponent(groupId)}/channel/${id}`);

/** Group is auto-created inside aiproxy on first channel insert */
export const createGroupChannel = async (groupId: string, data: AddChannelData): Promise<void> => {
  await post<void>(`/api/group/${encodeURIComponent(groupId)}/channel/`, data);
};

export const updateGroupChannel = async (
  groupId: string,
  id: number,
  data: AddChannelData
): Promise<void> => {
  await put<void>(`/api/group/${encodeURIComponent(groupId)}/channel/${id}`, data);
};

export const deleteGroupChannel = async (groupId: string, id: number): Promise<void> => {
  await del<void>(`/api/group/${encodeURIComponent(groupId)}/channel/${id}`);
};

export const updateGroupChannelStatus = async (
  groupId: string,
  id: number,
  status: ChannelStatus
): Promise<void> => {
  await post<void>(`/api/group/${encodeURIComponent(groupId)}/channel/${id}/status`, { status });
};

/* ═══ PR #621 Batch Operations ═══ */

export const batchDeleteGroupChannels = (groupId: string, ids: number[]): Promise<void> =>
  post<void>(`/api/group/${encodeURIComponent(groupId)}/channels/batch_delete`, { ids });

export const batchUpdateGroupChannelStatus = (
  groupId: string,
  ids: number[],
  status: ChannelStatus
): Promise<void> =>
  post<void>(`/api/group/${encodeURIComponent(groupId)}/channels/batch_status`, { ids, status });

export const requestBatchDeleteSystemChannels = async (ids: number[]): Promise<void> => {
  try {
    await post<void>('/api/channels/batch_delete', { ids });
  } catch {
    await Promise.all(ids.map((id) => deleteSystemChannel(id)));
  }
};

export const requestBatchUpdateSystemChannelStatus = async (
  ids: number[],
  status: ChannelStatus
): Promise<void> => {
  try {
    await post<void>('/api/channels/batch_status', { ids, status });
  } catch {
    await Promise.all(ids.map((id) => updateSystemChannelStatus(id, status)));
  }
};

/** 格式化成员在 AI Proxy 的分组 ID */
export const getSystemGroupId = (tmbId: string): string => `fastgpt:tmb:${tmbId}`;

export const testGroupChannel = async (
  groupId: string,
  id: number,
  model: string
): Promise<void> => {
  await get<void>(
    `/api/group/${encodeURIComponent(groupId)}/channel/${id}/test/${encodeURIComponent(model)}`
  );
};

/* ═══ Root cross-member ops ═══ */

/** Single-fetch a member channel across all groups (root cross-member ops, no group id needed) */
export const getGlobalGroupChannelById = (id: number): Promise<AiproxyGroupChannel> =>
  get<AiproxyGroupChannel>(`/api/group_channel/${id}`);

/* ═══ Provider type metas (channel form hints) ═══ */

/** aiproxy channel type metas per provider (defaultBaseUrl/keyHelp) for the
 *  channel create/edit form. Non-sensitive provider defaults, fetched
 *  server-side with the admin token — any authenticated user may read them
 *  (the admin passthrough itself stays root-only). Cached in memory (long TTL,
 *  near-static data) so opening the modal does not hit aiproxy every time. */
export const getChannelTypeMetas = (): Promise<
  Record<number, { defaultBaseUrl: string; keyHelp: string; name: string }>
> =>
  getCachedTypeMetas(() =>
    get<Record<number, { defaultBaseUrl: string; keyHelp: string; name: string }>>(
      '/api/channels/type_metas'
    )
  );

type AiproxyLogItem = Omit<ChannelLogListItem, 'channel'> & {
  channel?: number;
  group_channel_id?: number;
};

type AiproxyDashboardPoint = Omit<ChannelDashboardPoint, 'summary'> & {
  summary: Array<
    ChannelDashboardPoint['summary'][number] & {
      group_channel_id?: number;
    }
  >;
};

const toQueryString = (params: Record<string, string | number | boolean | undefined>): string => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
};

/**
 * 查询 system 或当前成员 group-channel 的调用日志，并统一渠道 ID 字段。
 * groupId 只接受 FastGPT 服务端根据会话推导的值，不从 API 入参透传。
 */
export const searchChannelLogs = async ({
  groupId,
  ...params
}: Omit<GetChannelLogsQuery, 'channelType'> & {
  groupId?: string;
}): Promise<GetChannelLogsResponse> => {
  const query = toQueryString({
    result_only: true,
    request_id: params.requestId,
    channel: params.channelId,
    model_name: params.modelName,
    code_type: params.codeType,
    start_timestamp: params.startTimestamp,
    end_timestamp: params.endTimestamp,
    p: params.pageNum ?? 1,
    per_page: params.pageSize
  });
  const path = groupId
    ? `/api/log/${encodeURIComponent(groupId)}/group_channel/search${query}`
    : `/api/logs/search${query}`;
  const result = await get<{ logs?: AiproxyLogItem[]; total?: number }>(path);

  return {
    list: (result.logs ?? []).map((item) => ({
      ...item,
      channel: item.channel ?? item.group_channel_id ?? 0
    })),
    total: result.total ?? 0
  };
};

/** 获取 system 或当前成员 group-channel 范围内的单条日志详情。 */
export const getChannelLogDetail = ({
  id,
  groupId
}: {
  id: number;
  groupId?: string;
}): Promise<GetChannelLogDetailResponse> =>
  get<GetChannelLogDetailResponse>(
    groupId
      ? `/api/log/${encodeURIComponent(groupId)}/group_channel/detail/${id}`
      : `/api/logs/detail/${id}`
  );

/**
 * 查询 system 或当前成员 group-channel 的时序监控，并统一 summary 渠道 ID 字段。
 */
export const getChannelDashboard = async ({
  groupId,
  ...params
}: Omit<GetChannelDashboardQuery, 'channelType'> & {
  groupId?: string;
}): Promise<ChannelDashboardPoint[]> => {
  const query = toQueryString({
    ...(groupId
      ? { group_channel: params.channelId }
      : {
          channel: params.channelId
        }),
    model: params.model,
    start_timestamp: params.startTimestamp,
    end_timestamp: params.endTimestamp,
    timezone: params.timezone,
    timespan: params.timespan
  });
  const path = groupId
    ? `/api/group/${encodeURIComponent(groupId)}/channel-dashboardv2${query}`
    : `/api/dashboardv2/${query}`;
  const result = await get<AiproxyDashboardPoint[]>(path);

  return (result ?? []).map((point) => ({
    ...point,
    summary: (point.summary ?? []).map((item) => ({
      ...item,
      channel_id: item.channel_id ?? item.group_channel_id
    }))
  }));
};
