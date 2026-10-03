export const AIPROXY_LIST_PAGE_SIZE = 100;

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

export type AiproxyLogUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cache_creation_tokens?: number;
  cached_tokens?: number;
};

export type AiproxyLogItem = {
  id: number;
  request_id?: string;
  token_name?: string;
  model: string;
  channel?: number;
  group_channel_id?: number;
  mode?: number;
  created_at: number;
  request_at: number;
  code: number;
  usage?: AiproxyLogUsage;
  endpoint?: string;
  content?: string;
  retry_times?: number;
  ttfb_milliseconds?: number;
  ip?: string;
};

export type AiproxyLogDetail = {
  request_body?: string;
  response_body?: string;
  request_body_truncated?: boolean;
  response_body_truncated?: boolean;
};

export type AiproxyLogSearchParams = {
  requestId?: string;
  channelId?: number;
  modelName?: string;
  codeType?: 'all' | 'success' | 'error' | number;
  startTimestamp?: number;
  endTimestamp?: number;
  pageNum?: number;
  pageSize?: number;
};

export type AiproxyLogSearchResult = {
  list: (AiproxyLogItem & { channel: number })[];
  total: number;
};

export type AiproxyDashboardParams = {
  channelId?: number;
  model?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  timezone?: string;
  timespan?: string;
};

export type AiproxyDashboardSummaryItem = {
  channel_id?: number;
  group_channel_id?: number;
  model: string;
  request_count: number;
  used_amount: number;
  exception_count: number;
  total_time_milliseconds: number;
  total_ttfb_milliseconds: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  max_rpm: number;
  max_tpm: number;
  cache_hit_count: number;
};

export type AiproxyDashboardPoint = {
  timestamp: number;
  summary: AiproxyDashboardSummaryItem[];
};

export type AiproxyTypeMetaItem = {
  defaultBaseUrl: string;
  keyHelp: string;
  name: string;
};

export type AiproxyEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};
