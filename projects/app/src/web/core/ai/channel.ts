import axios, { type Method } from 'axios';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type {
  ChannelBody,
  CreateChannelResponse,
  DeleteChannelResponse,
  ListChannelsResponse,
  ProviderMetasResponse,
  UpdateChannelBody,
  UpdateChannelResponse,
  UpdateChannelStatusBody,
  UpdateChannelStatusResponse,
  AffectedModelsResponse,
  ModelChannelsResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';
import {
  type ChannelInfoType,
  type ChannelLogListItemType,
  type ChannelRelatedModelItem,
  type DashboardDataItemType,
  DashboardDataItemSchema
} from '@/global/aiproxy/type';
import type { ChannelStatusEnum } from '@/global/aiproxy/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';

/** Channel kind for resource ops — mirrors the openapi ChannelType (design §2.9.4) */
export type ChannelKind = 'system' | 'team';

// ═══ FastGPT channel APIs (design §2.9.4) — migrated from the aiproxy passthrough ═══
// groupId is always derived server-side; clients only send the aiproxy channel id.

/** Channel list: root passes groupType (system=系统渠道 / team=全量成员渠道); members omit it (own channels) */
export const getChannelList = (params?: {
  groupType?: 'system' | 'team';
  pageNum?: number;
  pageSize?: number;
}) =>
  GET<ListChannelsResponse>('/core/ai/channel/list', params ?? {}).then((res) => {
    res.list.sort((a, b) => {
      if (a.status !== b.status) return a.status - b.status;
      return (b.priority ?? 0) - (a.priority ?? 0);
    });
    return res.list;
  });

export const postCreateChannel = (data: ChannelBody, groupType: 'system' | 'team') =>
  POST<CreateChannelResponse>('/core/ai/channel/create', {
    ...data,
    groupType
  });

/** PUT is a full replacement; id selects the channel, the rest is the new payload */
export const putChannel = (data: ChannelInfoType, channelType: ChannelKind) =>
  PUT<UpdateChannelResponse>('/core/ai/channel/update', {
    id: data.id,
    channelType,
    type: data.type,
    name: data.name,
    key: data.key,
    base_url: data.base_url,
    models: data.models,
    model_mapping: data.model_mapping,
    priority: data.priority ? Math.max(data.priority, 1) : undefined,
    status: data.status as UpdateChannelBody['status'],
    sets: data.sets
  });

export const putChannelStatus = (id: number, status: ChannelStatusEnum, channelType: ChannelKind) =>
  POST<UpdateChannelStatusResponse>('/core/ai/channel/status', {
    id,
    status: status as UpdateChannelStatusBody['status'],
    channelType
  });

/** Delete returns the pre-deletion affected models (design §9.3 delete protection) */
export const deleteChannel = (id: number, channelType: ChannelKind) =>
  DELETE<DeleteChannelResponse>('/core/ai/channel/delete', { id, channelType });

/** Pre-check for the delete confirmation dialog (F2-S4/F3-S4) */
export const getChannelAffectedModels = (id: number, channelType: ChannelKind) =>
  GET<AffectedModelsResponse>('/core/ai/channel/affectedModels', { id, channelType });

/** All related models of one channel (bucket-wide, model-name match) — hover details.
 *  Semantically distinct from getChannelAffectedModels (delete protection: only
 *  models reachable exclusively via this channel). */
export const getChannelModels = (id: number, channelType: ChannelKind) =>
  GET<{ models: ChannelRelatedModelItem[] }>('/core/ai/channel/models', { id, channelType });

/** Channels serving one model within its own bucket — hover detail for the
 *  model list's channelCount column (design §7.3). Reverse of getChannelModels. */
export const getModelChannels = (modelId: string) =>
  GET<ModelChannelsResponse>('/core/ai/channel/modelChannels', { modelId });

// ═══ aiproxy admin passthrough (root-only; see pages/api/aiproxy/[...path].ts) ═══
// Kept for the channel form's provider meta and the root-only log/monitoring pages.
// NOTE: /api/aiproxy/[...path].ts requires authSystemAdmin, so these calls are root-only.

interface AiproxyResponseDataType {
  success: boolean;
  message: string;
  data: any;
}

function aiproxyCheckRes(data: AiproxyResponseDataType) {
  if (data === undefined) {
    console.log('error->', data, 'data is empty');
    return Promise.reject(i18nT('common:server_error'));
  } else if (!data.success) {
    return Promise.reject(data);
  }
  return data.data;
}

function aiproxyResponseError(err: any) {
  console.log('error->', '请求错误', err);
  const data = err?.response?.data || err;

  if (!err) {
    return Promise.reject({ message: i18nT('common:error.unKnow') });
  }
  if (typeof err === 'string') {
    return Promise.reject({ message: err });
  }
  if (typeof data === 'string') {
    return Promise.reject(data);
  }

  return Promise.reject(data);
}

const aiproxyInstance = axios.create({
  timeout: 60000, // 超时时间
  headers: {
    'content-type': 'application/json'
  }
});

aiproxyInstance.interceptors.response.use(
  (response) => response,
  (err) => Promise.reject(err)
);

function aiproxyRequest(url: string, data: any, method: Method): any {
  /* 去空 */
  for (const key in data) {
    if (data[key] === undefined) {
      delete data[key];
    }
  }

  return aiproxyInstance
    .request({
      baseURL: getWebReqUrl('/api/aiproxy/api'),
      url,
      method,
      data: ['POST', 'PUT'].includes(method) ? data : undefined,
      params: !['POST', 'PUT'].includes(method) ? data : undefined
    })
    .then((res) => aiproxyCheckRes(res.data))
    .catch((err) => aiproxyResponseError(err));
}

function aiproxyGET<T = undefined>(url: string, params = {}): Promise<T> {
  return aiproxyRequest(url, params, 'GET');
}
function aiproxyPOST<T = undefined>(url: string, data = {}): Promise<T> {
  return aiproxyRequest(url, data, 'POST');
}
function aiproxyPUT<T = undefined>(url: string, data = {}): Promise<T> {
  return aiproxyRequest(url, data, 'PUT');
}
function aiproxyDELETE<T = undefined>(url: string, data = {}): Promise<T> {
  return aiproxyRequest(url, data, 'DELETE');
}

/** aiproxy provider metas (defaultBaseUrl/keyHelp) — any authenticated user
 *  (served by /core/ai/channel/providerMetas with a server-side admin token) */
export const getChannelProviders = () =>
  GET<ProviderMetasResponse>('/core/ai/channel/providerMetas');

export const getChannelLog = (params: {
  request_id?: string;
  channel?: string;
  model_name?: string;
  code_type?: 'all' | 'success' | 'error';
  start_timestamp: number;
  end_timestamp: number;
  offset: number;
  pageSize: number;
}) =>
  aiproxyGET<{
    logs: ChannelLogListItemType[];
    total: number;
  }>('/logs/search', {
    result_only: true,
    request_id: params.request_id,
    channel: params.channel,
    model_name: params.model_name,
    code_type: params.code_type,
    start_timestamp: params.start_timestamp,
    end_timestamp: params.end_timestamp,
    p: Math.floor(params.offset / params.pageSize) + 1,
    per_page: params.pageSize
  }).then((res) => {
    return {
      list: res.logs,
      total: res.total
    };
  });

export const getLogDetail = (id: number) =>
  aiproxyGET<{
    request_body: string;
    response_body: string;
  }>(`/logs/detail/${id}`);

export const getDashboardV2 = (params: {
  channel?: number;
  model?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  timezone: string;
  timespan: 'day' | 'hour' | 'minute';
}) =>
  aiproxyGET<
    {
      timestamp: number;
      summary: DashboardDataItemType[];
    }[]
  >('/dashboardv2/', params).then((res) =>
    res.map((item) => ({
      ...item,
      summary: item.summary.map((item) => DashboardDataItemSchema.parse(item))
    }))
  );
