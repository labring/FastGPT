import { axiosWithoutSSRF } from '../../../common/api/axios';
import { getAIProxyAdminConfig } from '../../../thirdProvider/aiproxy/config';
import {
  CACHE_KEY_GLOBAL_GROUPS,
  CACHE_KEY_SYSTEM,
  getCachedChannels,
  getCachedTypeMetas,
  invalidateGroupChannelCache,
  invalidateSystemChannelCache
} from './cache';

/**
 * aiproxy admin API typed client (design §2.9.1) — cache-aware.
 *
 * aiproxy is the single source of truth for channels — FastGPT keeps no local
 * channel collection. Every call uses the admin bearer token from
 * `getAIProxyAdminConfig()` (serviceEnv.AIPROXY_API_ENDPOINT / AIPROXY_API_TOKEN)
 * and unwraps the `{ success, message, data }` envelope; a non-success envelope
 * or an HTTP error throws so callers can normalize via controller#normalizeAiproxyError.
 *
 * Cache policy (design §2.9.5): this client is the ONLY cache owner, so every
 * new call site gets caching for free:
 * - Reads go through the TTL-cached `getCached*` entry points (30s buckets).
 * - Writes invalidate the affected buckets on success (failures keep the
 *   stale-but-consistent bucket), no explicit invalidation needed by callers.
 * - `getRealtime*` entry points bypass the cache for delete-protection math
 *   (getChannelAffectedModels must reflect current state); `get*ById` single
 *   fetches stay raw (resolve existence must be real-time, cache keys cannot
 *   carry an id filter).
 */

export const AIPROXY_LIST_PAGE_SIZE = 100; // aiproxy caps per_page at 100

// groupId convention lives in const.ts (leaf module) so relay scope injection
// (core/ai/config.ts) can reuse it without pulling this admin client chain.
export { getSystemGroupId } from './const';

/** Channel status: 1 = enabled, 2 = disabled */
export type ChannelStatus = 1 | 2;

/** Raw system channel (aiproxy ChannelResponse, core/controller/channel.go) */
export type AiproxyChannel = {
  id: number;
  name: string;
  type: number;
  key?: string;
  base_url?: string;
  proxy_url?: string;
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

const toListParams = ({ page, perPage }: ChannelListParams) => {
  const params = new URLSearchParams();
  if (page) params.set('page', String(page));
  if (perPage) params.set('per_page', String(perPage));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

/* ═══ Raw single-page fetches (internal — no cache) ═══ */

const listSystemChannelsRaw = ({
  page,
  perPage
}: ChannelListParams = {}): Promise<ChannelListResult> =>
  get<ChannelListResult>(`/api/channels/${toListParams({ page, perPage })}`);

const listGroupChannelsRaw = (
  groupId: string,
  { page, perPage }: ChannelListParams = {}
): Promise<ChannelListResult<AiproxyGroupChannel>> =>
  get<ChannelListResult<AiproxyGroupChannel>>(
    `/api/group/${encodeURIComponent(groupId)}/channels/${toListParams({ page, perPage })}`
  );

const listGlobalGroupChannelsRaw = ({
  groupId,
  page,
  perPage
}: ChannelListParams & { groupId?: string } = {}): Promise<
  ChannelListResult<AiproxyGroupChannel>
> => {
  const params = new URLSearchParams();
  if (groupId) params.set('group', groupId);
  if (page) params.set('page', String(page));
  if (perPage) params.set('per_page', String(perPage));
  const qs = params.toString();
  return get<ChannelListResult<AiproxyGroupChannel>>(`/api/group_channels/${qs ? `?${qs}` : ''}`);
};

/* ═══ Full-fetch pagination loops (aiproxy list is paginated, cap 100/page) ═══ */

/**
 * Fetch one page of a bucket and append it. aiproxy may return `channels: null`
 * for an empty/degraded result (Go nil slices marshal to JSON null) — spreading
 * null would throw an unhelpful "X is not iterable" TypeError (production 500
 * on the channel list). A non-array page is treated as the end of the list;
 * an empty page also ends the loop so a stale/absent `total` cannot spin the
 * pagination forever.
 */
const fetchAllSystemChannels = async (): Promise<AiproxyChannel[]> => {
  const all: AiproxyChannel[] = [];
  let page = 1;
  for (;;) {
    const { channels, total } = await listSystemChannelsRaw({
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

const fetchAllGroupChannels = async (groupId: string): Promise<AiproxyGroupChannel[]> => {
  const all: AiproxyGroupChannel[] = [];
  let page = 1;
  for (;;) {
    const { channels, total } = await listGroupChannelsRaw(groupId, {
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

const fetchAllGlobalGroupChannels = async (): Promise<AiproxyGroupChannel[]> => {
  const all: AiproxyGroupChannel[] = [];
  let page = 1;
  for (;;) {
    const { channels, total } = await listGlobalGroupChannelsRaw({
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

/* ═══ Paginated slice over a cached bucket (local paging) ═══
 * Mirrors aiproxy's NormalizePageParams bounds (page<=0→1, perPage clamped to
 * [1,100]); perPage omitted returns the whole bucket — the controller reads
 * `(await listX()).channels` for the full set. */

const paginateBucket = <T>(all: T[], page?: number, perPage?: number): ChannelListResult<T> => {
  const size = perPage ? Math.min(Math.max(perPage, 1), 100) : all.length;
  const start = page && page > 1 ? (page - 1) * size : 0;
  return { channels: all.slice(start, start + size), total: all.length };
};

/* ═══ Public list entry points — cache-aware ═══
 * The list helpers ARE the cache boundary: reads go through the TTL buckets
 * (first call fetches the full bucket, later calls page locally — 0 round
 * trips), writes auto-invalidate on success. Callers never choose a cache
 * variant; the only exceptions are documented below:
 * - getRealtime* (delete-protection math must see current state)
 * - get*ById single fetches (resolve's existence check must be real-time)
 * - listGlobalGroupChannels with a groupId filter (cache key cannot carry it) */

export const listSystemChannels = async ({
  page,
  perPage
}: ChannelListParams = {}): Promise<ChannelListResult> => {
  const all = await getCachedChannels(fetchAllSystemChannels, CACHE_KEY_SYSTEM);
  return paginateBucket(all, page, perPage);
};

export const listGroupChannels = async (
  groupId: string,
  { page, perPage }: ChannelListParams = {}
): Promise<ChannelListResult<AiproxyGroupChannel>> => {
  const all = await getCachedChannels(() => fetchAllGroupChannels(groupId), groupId);
  return paginateBucket(all, page, perPage);
};

export const listGlobalGroupChannels = async ({
  groupId,
  page,
  perPage
}: ChannelListParams & { groupId?: string } = {}): Promise<
  ChannelListResult<AiproxyGroupChannel>
> => {
  // One shared bucket holds the FULL member-channel set; the ?group= filter is
  // applied in memory (exact group_id match, equivalent to aiproxy's server-side
  // filter). No per-filter buckets, no separate TTL/invalidation bookkeeping —
  // a group-channel write drops the shared bucket and every filtered view with it.
  const all = await getCachedChannels(() => fetchAllGlobalGroupChannels(), CACHE_KEY_GLOBAL_GROUPS);
  const filtered = groupId ? all.filter((c) => c.group_id === groupId) : all;
  return paginateBucket(filtered, page, perPage);
};

/* ═══ Realtime read entry points (never cached — delete-protection math, F2-S4/F3-S4) ═══ */

export const getRealtimeSystemChannels = (): Promise<AiproxyChannel[]> => fetchAllSystemChannels();
export const getRealtimeGroupChannels = (groupId: string): Promise<AiproxyGroupChannel[]> =>
  fetchAllGroupChannels(groupId);

/**
 * Single-fetch a system channel by id (1 round trip, no list traversal).
 * NOTE: aiproxy returns HTTP 500 with a "record not found" message for missing
 * ids (core/controller/channel.go GetChannel) — normalized to channelNotExist
 * by controller#normalizeAiproxyError.
 */
export const getSystemChannelById = (id: number): Promise<AiproxyChannel> =>
  get<AiproxyChannel>(`/api/channel/${id}`);

/** Writes invalidate the affected buckets on success; failures keep the stale-but-consistent bucket */
export const createSystemChannel = async (data: AddChannelData): Promise<void> => {
  await post<void>(`/api/channel/`, data);
  invalidateSystemChannelCache();
};

export const updateSystemChannel = async (id: number, data: AddChannelData): Promise<void> => {
  await put<void>(`/api/channel/${id}`, data);
  invalidateSystemChannelCache();
};

export const deleteSystemChannel = async (id: number): Promise<void> => {
  await del<void>(`/api/channel/${id}`);
  invalidateSystemChannelCache();
};

export const updateSystemChannelStatus = async (
  id: number,
  status: ChannelStatus
): Promise<void> => {
  await post<void>(`/api/channel/${id}/status`, { status });
  invalidateSystemChannelCache();
};

/**
 * Test one model on a channel; the result is persisted inside aiproxy
 * (used_amount/request_count, shown in list views) — invalidate after success.
 */
export const testSystemChannel = async (id: number, model: string): Promise<void> => {
  await get<void>(`/api/channel/${id}/test/${encodeURIComponent(model)}`);
  invalidateSystemChannelCache();
};

/* ═══ Member channels (group-scoped) ═══ */

/** Single-fetch a member channel inside its own group (scope enforced by the group path) */
export const getGroupChannelById = (groupId: string, id: number): Promise<AiproxyGroupChannel> =>
  get<AiproxyGroupChannel>(`/api/group/${encodeURIComponent(groupId)}/channel/${id}`);

/** Group is auto-created inside aiproxy on first channel insert (idempotent), no pre-check needed */
export const createGroupChannel = async (groupId: string, data: AddChannelData): Promise<void> => {
  await post<void>(`/api/group/${encodeURIComponent(groupId)}/channel/`, data);
  invalidateGroupChannelCache(groupId);
};

export const updateGroupChannel = async (
  groupId: string,
  id: number,
  data: AddChannelData
): Promise<void> => {
  await put<void>(`/api/group/${encodeURIComponent(groupId)}/channel/${id}`, data);
  invalidateGroupChannelCache(groupId);
};

export const deleteGroupChannel = async (groupId: string, id: number): Promise<void> => {
  await del<void>(`/api/group/${encodeURIComponent(groupId)}/channel/${id}`);
  invalidateGroupChannelCache(groupId);
};

export const updateGroupChannelStatus = async (
  groupId: string,
  id: number,
  status: ChannelStatus
): Promise<void> => {
  await post<void>(`/api/group/${encodeURIComponent(groupId)}/channel/${id}/status`, { status });
  invalidateGroupChannelCache(groupId);
};

/** Test result is persisted inside aiproxy (used_amount/request_count) — invalidate after success */
export const testGroupChannel = async (
  groupId: string,
  id: number,
  model: string
): Promise<void> => {
  await get<void>(
    `/api/group/${encodeURIComponent(groupId)}/channel/${id}/test/${encodeURIComponent(model)}`
  );
  invalidateGroupChannelCache(groupId);
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
