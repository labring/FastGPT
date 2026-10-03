/**
 * AIProxy 中支持 map_reasoning_to_reasoning_content 响应字段重写的 ChannelType ID：
 * - 1: ChannelTypeOpenAI
 */
export const REASONING_FIELD_MAPPING_CHANNEL_TYPES = [1] as const;

export enum ChannelStatusEnum {
  ChannelStatusUnknown = 0,
  ChannelStatusEnabled = 1,
  ChannelStatusDisabled = 2,
  ChannelStatusAutoDisabled = 3
}

export type ChannelStatusType = 1 | 2;

export const ChannelStatusMap = {
  [ChannelStatusEnum.ChannelStatusUnknown]: {
    label: 'config_model:channel_status_unknown',
    colorSchema: 'gray'
  },
  [ChannelStatusEnum.ChannelStatusEnabled]: {
    label: 'config_model:channel_status_enabled',
    colorSchema: 'green'
  },
  [ChannelStatusEnum.ChannelStatusDisabled]: {
    label: 'config_model:channel_status_disabled',
    colorSchema: 'red'
  },
  [ChannelStatusEnum.ChannelStatusAutoDisabled]: {
    label: 'config_model:channel_status_auto_disabled',
    colorSchema: 'gray'
  }
} as const;

export type ChannelInfoType = {
  id: number;
  name: string;
  type: number;
  key: string;
  base_url?: string;
  models: string[];
  model_mapping?: Record<string, string> | null;
  configs?: Record<string, any> | null;
  status: ChannelStatusEnum | ChannelStatusType;
  created_at?: number;
  priority?: number;
  sets?: string[] | null;
  balance_threshold?: number;
  proxy_url?: string | null;
};

export const defaultChannel: ChannelInfoType = {
  id: 0,
  status: ChannelStatusEnum.ChannelStatusEnabled,
  type: 1,
  created_at: 0,
  models: [],
  model_mapping: {},
  key: '',
  name: '',
  base_url: '',
  priority: 1
};

export type CreateChannelProps = {
  type: number;
  model_mapping?: Record<string, string>;
  key?: string;
  name: string;
  base_url?: string;
  models: string[];
};
