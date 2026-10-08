import { axiosWithoutSSRF } from '../../common/api/axios';
import { isAiproxyNotFoundError } from './error';
import { getAIProxyAdminConfig } from './config';
import {
  AIPROXY_LIST_PAGE_SIZE,
  type AddChannelData,
  type AiproxyChannel,
  type AiproxyDashboardParams,
  type AiproxyDashboardPoint,
  type AiproxyEnvelope,
  type AiproxyGroupChannel,
  type AiproxyLogDetail,
  type AiproxyLogItem,
  type AiproxyLogSearchParams,
  type AiproxyLogSearchResult,
  type AiproxyTypeMetaItem,
  type ChannelListParams,
  type ChannelListResult,
  type ChannelStatus,
  type UpdateChannelData
} from './type';

const buildChannelListUrl = (
  basePath: string,
  { page, perPage, search }: ChannelListParams = {},
  extraParams?: Record<string, string | undefined>
) => {
  const isSearch = Boolean(search && search.trim());
  const normalizedBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const path = isSearch ? `${normalizedBasePath}/search` : `${normalizedBasePath}/`;
  const params = new URLSearchParams();
  if (page) params.set('page', String(page));
  if (perPage) params.set('per_page', String(perPage));
  if (isSearch) params.set('keyword', search!.trim());
  if (extraParams) {
    Object.entries(extraParams).forEach(([k, v]) => {
      if (v !== undefined) params.set(k, v);
    });
  }
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ''}`;
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

const toQueryString = (params: Record<string, string | number | boolean | undefined>): string => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
};

/**
 * 统一的 AI Proxy HTTP 客户端（基础设施防腐层）
 *
 * 封装与 labring/aiproxy 服务的低级网络通信，
 * 隔离底层的 REST 路由、Token 注入、SSRF 防御与 Envelope 解包。
 */
export class AIProxyClient {
  private readonly getConfig: () => { baseUrl: string; token: string };

  constructor(configGetter: () => { baseUrl: string; token: string } = getAIProxyAdminConfig) {
    this.getConfig = configGetter;
  }

  private async request<T>(
    method: 'get' | 'post' | 'put' | 'delete',
    url: string,
    body?: unknown
  ): Promise<T> {
    const { baseUrl, token } = this.getConfig();

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
  }

  public get<T>(url: string) {
    return this.request<T>('get', url);
  }

  public post<T>(url: string, body?: unknown) {
    return this.request<T>('post', url, body);
  }

  public put<T>(url: string, body?: unknown) {
    return this.request<T>('put', url, body);
  }

  public del<T>(url: string) {
    return this.request<T>('delete', url);
  }

  /* ═══ Shared Operation Factories ═══ */

  private createChannelOperations<T extends AiproxyChannel | AiproxyGroupChannel>(
    basePath: string,
    options?: { fallbackEmptyOnNotFound?: boolean }
  ) {
    const list = async (params: ChannelListParams = {}): Promise<ChannelListResult<T>> => {
      try {
        return normalizeListResult(
          await this.get<ChannelListResult<T>>(buildChannelListUrl(`${basePath}/channels`, params))
        );
      } catch (error) {
        if (options?.fallbackEmptyOnNotFound && isAiproxyNotFoundError(error)) {
          return { channels: [], total: 0 };
        }
        throw error;
      }
    };

    const listAll = async (): Promise<T[]> => {
      const all: T[] = [];
      let page = 1;
      for (;;) {
        const { channels, total } = await list({
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

    return {
      list,
      listAll,
      get: (id: number): Promise<T> => this.get<T>(`${basePath}/channel/${id}`),
      create: (data: AddChannelData): Promise<void> =>
        this.post<void>(`${basePath}/channel/`, data),
      update: (id: number, data: UpdateChannelData): Promise<void> =>
        this.put<void>(`${basePath}/channel/${id}`, data),
      delete: (id: number): Promise<void> => this.del<void>(`${basePath}/channel/${id}`),
      batchDelete: async (ids: number[]): Promise<void> => {
        if (ids.length === 0) return;
        await this.post<void>(`${basePath}/channels/batch_delete`, ids);
      },
      updateStatus: (id: number, status: ChannelStatus): Promise<void> =>
        this.post<void>(`${basePath}/channel/${id}/status`, { status }),
      batchUpdateStatus: async (ids: number[], status: ChannelStatus): Promise<void> => {
        if (ids.length === 0) return;
        await Promise.all(
          ids.map((id) => this.post<void>(`${basePath}/channel/${id}/status`, { status }))
        );
      },
      test: (id: number, model: string): Promise<void> =>
        this.get<void>(`${basePath}/channel/${id}/test/${encodeURIComponent(model)}`)
    };
  }

  private createLogOperations(basePath: string) {
    return {
      search: async (params: AiproxyLogSearchParams = {}): Promise<AiproxyLogSearchResult> => {
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
        const result = await this.get<{ logs?: AiproxyLogItem[]; total?: number }>(
          `${basePath}/search${query}`
        );
        return {
          list: (result.logs ?? []).map((item) => ({
            ...item,
            channel: item.channel ?? item.group_channel_id ?? 0
          })),
          total: result.total ?? 0
        };
      },
      detail: (id: number): Promise<AiproxyLogDetail> => {
        return this.get<AiproxyLogDetail>(`${basePath}/detail/${id}`);
      }
    };
  }

  private createDashboardOperations(
    urlGetter: (query: string) => string,
    options?: { isGroup?: boolean }
  ) {
    return {
      get: async (params: AiproxyDashboardParams = {}): Promise<AiproxyDashboardPoint[]> => {
        const query = toQueryString({
          ...(options?.isGroup
            ? { group_channel: params.channelId }
            : { channel: params.channelId }),
          model: params.model,
          start_timestamp: params.startTimestamp,
          end_timestamp: params.endTimestamp,
          timezone: params.timezone,
          timespan: params.timespan
        });
        const result = await this.get<AiproxyDashboardPoint[]>(urlGetter(query));
        return (result ?? []).map((point) => ({
          ...point,
          summary: (point.summary ?? []).map((item) => ({
            ...item,
            channel_id: item.channel_id ?? item.group_channel_id ?? 0,
            max_rpm: item.max_rpm ?? 0,
            max_tpm: item.max_tpm ?? 0,
            cache_hit_count: item.cache_hit_count ?? 0
          }))
        }));
      }
    };
  }

  /* ═══ System Scope Operations ═══ */

  public readonly system = {
    channels: this.createChannelOperations<AiproxyChannel>('/api'),
    logs: this.createLogOperations('/api/logs'),
    dashboard: this.createDashboardOperations((query) => `/api/dashboardv2/${query}`)
  };

  /* ═══ Group Scope Operations ═══ */

  public group(groupId: string) {
    const encodedGroupId = encodeURIComponent(groupId);

    return {
      channels: this.createChannelOperations<AiproxyGroupChannel>(`/api/group/${encodedGroupId}`, {
        fallbackEmptyOnNotFound: true
      }),
      logs: this.createLogOperations(`/api/log/${encodedGroupId}/group_channel`),
      dashboard: this.createDashboardOperations(
        (query) => `/api/group/${encodedGroupId}/channel-dashboardv2${query}`,
        { isGroup: true }
      )
    };
  }

  /* ═══ Provider Type Metas ═══ */

  public getTypeMetas(): Promise<Record<number, AiproxyTypeMetaItem>> {
    return this.get<Record<number, AiproxyTypeMetaItem>>('/api/channels/type_metas');
  }
}

/** 默认的 AI Proxy 客户端单例 */
export const aiProxyClient = new AIProxyClient();
