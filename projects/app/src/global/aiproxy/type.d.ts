import type { ChannelStatusEnum } from './constants';

export type ChannelInfoType = {
  model_mapping: Record<string, any>;
  key: string;
  name: string;
  base_url: string;
  models: any[];
  id: number;
  status: ChannelStatusEnum;
  type: number;
  created_at: number;
  priority: number;
};

// Channel api
export type ChannelListQueryType = {
  page: number;
  perPage: number;
};
export type ChannelListResponseType = ChannelInfoType[];

export type CreateChannelProps = {
  type: number;
  model_mapping: Record<string, any>;
  key?: string;
  name: string;
  base_url: string;
  models: string[];
};

// Log
export type ChannelLogUsageType = {
  cache_creation_tokens?: number;
  cached_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};
export type ChannelLogListItemType = {
  token_name: string;
  model: string;
  request_id: string;
  id: number;
  channel: number;
  mode: number;
  created_at: number;
  request_at: number;
  code: number;
  usage?: ChannelLogUsageType;
  endpoint: string;
  content?: string;
  retry_times?: number;
};

export type DashboardDataItemType = {
  channel_id?: number;
  model: string;
  request_count?: number;
  used_amount?: number;
  exception_count?: number;
  total_time_milliseconds?: number;
  total_ttfb_milliseconds?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  max_rpm?: number;
  max_tpm?: number;
};
