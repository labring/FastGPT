import { ChannelStatusEnum } from './constants';

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
  prompt_tokens: number;
  completion_tokens: number;
  endpoint: string;
  content?: string;
};
