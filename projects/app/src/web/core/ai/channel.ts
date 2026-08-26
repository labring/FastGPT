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
  ModelChannelsResponse,
  ChannelLogListItem,
  GetChannelLogDetailResponse,
  ChannelDashboardPoint
} from '@fastgpt/global/openapi/core/ai/channel/api';
import { type ChannelInfoType, type ChannelRelatedModelItem } from '@/global/aiproxy/type';
import type { ChannelStatusEnum } from '@/global/aiproxy/constants';

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

/** aiproxy provider metas (defaultBaseUrl/keyHelp) — any authenticated user
 *  (served by /core/ai/channel/providerMetas with a server-side admin token) */
export const getChannelProviders = () =>
  GET<ProviderMetasResponse>('/core/ai/channel/providerMetas');

export const getChannelLog = (params: {
  channelType: ChannelKind;
  request_id?: string;
  channel?: string;
  model_name?: string;
  code_type?: 'all' | 'success' | 'error';
  start_timestamp: number;
  end_timestamp: number;
  offset?: number;
  pageNum?: number;
  pageSize: number;
}) =>
  GET<{
    list: ChannelLogListItem[];
    total: number;
  }>('/core/ai/channel/logs', {
    channelType: params.channelType,
    requestId: params.request_id,
    channelId: params.channel,
    modelName: params.model_name,
    codeType: params.code_type,
    startTimestamp: params.start_timestamp,
    endTimestamp: params.end_timestamp,
    pageNum: params.pageNum ?? Math.floor((params.offset ?? 0) / params.pageSize) + 1,
    pageSize: params.pageSize
  });

export const getLogDetail = (id: number, channelType: ChannelKind) =>
  GET<GetChannelLogDetailResponse>('/core/ai/channel/logDetail', { id, channelType });

export const getDashboardV2 = (params: {
  channelType: ChannelKind;
  channel?: number;
  model?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  timezone: string;
  timespan: 'day' | 'hour' | 'minute';
}) =>
  GET<ChannelDashboardPoint[]>('/core/ai/channel/dashboard', {
    channelType: params.channelType,
    channelId: params.channel,
    model: params.model,
    startTimestamp: params.start_timestamp,
    endTimestamp: params.end_timestamp,
    timezone: params.timezone,
    timespan: params.timespan
  });
