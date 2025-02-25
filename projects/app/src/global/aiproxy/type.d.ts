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
