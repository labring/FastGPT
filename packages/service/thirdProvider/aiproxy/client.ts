import { axiosWithoutSSRF } from '../../common/api/axios';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
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
  type ChannelStatus
} from './type';

const toListQueryString = ({ page, perPage, search }: ChannelListParams) => {
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

    try {
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
    } catch (error: any) {
      if (
        error?.response?.status === 404 ||
        /record not found/i.test(error?.response?.data?.message ?? '')
      ) {
        return Promise.reject(ModelErrEnum.channelNotExist);
      }
      return Promise.reject(getErrText(error));
    }
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

  /* ═══ System Scope Operations ═══ */

  public readonly system = {
    channels: {
      list: async (params: ChannelListParams = {}): Promise<ChannelListResult<AiproxyChannel>> => {
        return normalizeListResult(
          await this.get<ChannelListResult<AiproxyChannel>>(
            `/api/channels/${toListQueryString(params)}`
          )
        );
      },
      listAll: async (): Promise<AiproxyChannel[]> => {
        const all: AiproxyChannel[] = [];
        let page = 1;
        for (;;) {
          const { channels, total } = await this.system.channels.list({
            page,
            perPage: AIPROXY_LIST_PAGE_SIZE
          });
          if (!Array.isArray(channels)) break;
          all.push(...channels);
          if (channels.length === 0 || all.length >= total) break;
          page += 1;
        }
        return all;
      },
      get: (id: number): Promise<AiproxyChannel> => {
        return this.get<AiproxyChannel>(`/api/channel/${id}`);
      },
      create: async (data: AddChannelData): Promise<void> => {
        await this.post<void>('/api/channel/', data);
      },
      update: async (id: number, data: AddChannelData): Promise<void> => {
        await this.put<void>(`/api/channel/${id}`, data);
      },
      delete: async (id: number): Promise<void> => {
        await this.del<void>(`/api/channel/${id}`);
      },
      batchDelete: async (ids: number[]): Promise<void> => {
        if (ids.length === 0) return;
        try {
          await this.post<void>('/api/channels/batch_delete', { ids });
        } catch {
          await Promise.all(ids.map((id) => this.system.channels.delete(id)));
        }
      },
      updateStatus: async (id: number, status: ChannelStatus): Promise<void> => {
        await this.post<void>(`/api/channel/${id}/status`, { status });
      },
      batchUpdateStatus: async (ids: number[], status: ChannelStatus): Promise<void> => {
        if (ids.length === 0) return;
        try {
          await this.post<void>('/api/channels/batch_status', { ids, status });
        } catch {
          await Promise.all(ids.map((id) => this.system.channels.updateStatus(id, status)));
        }
      },
      test: async (id: number, model: string): Promise<void> => {
        await this.get<void>(`/api/channel/${id}/test/${encodeURIComponent(model)}`);
      }
    },
    logs: {
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
          `/api/logs/search${query}`
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
        return this.get<AiproxyLogDetail>(`/api/logs/detail/${id}`);
      }
    },
    dashboard: {
      get: async (params: AiproxyDashboardParams = {}): Promise<AiproxyDashboardPoint[]> => {
        const query = toQueryString({
          channel: params.channelId,
          model: params.model,
          start_timestamp: params.startTimestamp,
          end_timestamp: params.endTimestamp,
          timezone: params.timezone,
          timespan: params.timespan
        });
        const result = await this.get<AiproxyDashboardPoint[]>(`/api/dashboardv2/${query}`);
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
    }
  };

  /* ═══ Group Scope Operations ═══ */

  public group(groupId: string) {
    const encodedGroupId = encodeURIComponent(groupId);

    return {
      channels: {
        list: async (
          params: ChannelListParams = {}
        ): Promise<ChannelListResult<AiproxyGroupChannel>> => {
          return normalizeListResult(
            await this.get<ChannelListResult<AiproxyGroupChannel>>(
              `/api/group/${encodedGroupId}/channels/${toListQueryString(params)}`
            )
          );
        },
        listAll: async (): Promise<AiproxyGroupChannel[]> => {
          const all: AiproxyGroupChannel[] = [];
          let page = 1;
          for (;;) {
            const { channels, total } = await this.group(groupId).channels.list({
              page,
              perPage: AIPROXY_LIST_PAGE_SIZE
            });
            if (!Array.isArray(channels)) break;
            all.push(...channels);
            if (channels.length === 0 || all.length >= total) break;
            page += 1;
          }
          return all;
        },
        get: (id: number): Promise<AiproxyGroupChannel> => {
          return this.get<AiproxyGroupChannel>(`/api/group/${encodedGroupId}/channel/${id}`);
        },
        create: async (data: AddChannelData): Promise<void> => {
          await this.post<void>(`/api/group/${encodedGroupId}/channel/`, data);
        },
        update: async (id: number, data: AddChannelData): Promise<void> => {
          await this.put<void>(`/api/group/${encodedGroupId}/channel/${id}`, data);
        },
        delete: async (id: number): Promise<void> => {
          await this.del<void>(`/api/group/${encodedGroupId}/channel/${id}`);
        },
        batchDelete: async (ids: number[]): Promise<void> => {
          if (ids.length === 0) return;
          await this.post<void>(`/api/group/${encodedGroupId}/channels/batch_delete`, { ids });
        },
        updateStatus: async (id: number, status: ChannelStatus): Promise<void> => {
          await this.post<void>(`/api/group/${encodedGroupId}/channel/${id}/status`, { status });
        },
        batchUpdateStatus: async (ids: number[], status: ChannelStatus): Promise<void> => {
          if (ids.length === 0) return;
          await this.post<void>(`/api/group/${encodedGroupId}/channels/batch_status`, {
            ids,
            status
          });
        },
        test: async (id: number, model: string): Promise<void> => {
          await this.get<void>(
            `/api/group/${encodedGroupId}/channel/${id}/test/${encodeURIComponent(model)}`
          );
        }
      },
      logs: {
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
            `/api/log/${encodedGroupId}/group_channel/search${query}`
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
          return this.get<AiproxyLogDetail>(
            `/api/log/${encodedGroupId}/group_channel/detail/${id}`
          );
        }
      },
      dashboard: {
        get: async (params: AiproxyDashboardParams = {}): Promise<AiproxyDashboardPoint[]> => {
          const query = toQueryString({
            group_channel: params.channelId,
            model: params.model,
            start_timestamp: params.startTimestamp,
            end_timestamp: params.endTimestamp,
            timezone: params.timezone,
            timespan: params.timespan
          });
          const result = await this.get<AiproxyDashboardPoint[]>(
            `/api/group/${encodedGroupId}/channel-dashboardv2${query}`
          );
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
      }
    };
  }

  /* ═══ Global Group Channels (Root Aggregation View) ═══ */

  public readonly globalGroupChannels = {
    list: async ({
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
        await this.get<ChannelListResult<AiproxyGroupChannel>>(
          `/api/group_channels/${qs ? `?${qs}` : ''}`
        )
      );
    },
    get: (id: number): Promise<AiproxyGroupChannel> => {
      return this.get<AiproxyGroupChannel>(`/api/group_channel/${id}`);
    }
  };

  /* ═══ Provider Type Metas ═══ */

  public getTypeMetas(): Promise<Record<number, AiproxyTypeMetaItem>> {
    return this.get<Record<number, AiproxyTypeMetaItem>>('/api/channels/type_metas');
  }
}

/** 默认的 AI Proxy 客户端单例 */
export const aiProxyClient = new AIProxyClient();
