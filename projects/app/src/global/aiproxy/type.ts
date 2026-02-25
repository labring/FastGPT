import z from 'zod';
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
  ttfb_milliseconds?: number;
  ip: string;
};

export const DashboardDataItemSchema = z.object({
  channel_id: z.number().optional(),
  model: z.string(),
  request_count: z.number().optional().default(0),
  used_amount: z.number().optional().default(0),
  exception_count: z.number().optional().default(0),
  total_time_milliseconds: z.number().optional().default(0),
  total_ttfb_milliseconds: z.number().optional().default(0),
  input_tokens: z.number().optional().default(0),
  output_tokens: z.number().optional().default(0),
  total_tokens: z.number().optional().default(0),
  max_rpm: z.number().optional().default(0),
  max_tpm: z.number().optional().default(0),
  cache_hit_count: z.number().default(0)
});
export type DashboardDataItemType = z.infer<typeof DashboardDataItemSchema>;
