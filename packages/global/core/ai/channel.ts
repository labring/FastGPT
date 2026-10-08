/**
 * AIProxy 中支持 map_reasoning_to_reasoning_content 响应字段重写的上游渠道协议 ID (ChannelProviderType)：
 * - 1: OpenAI
 */
export const REASONING_FIELD_MAPPING_CHANNEL_TYPES = [1] as const;

/**
 * AIProxy 上游渠道协议类型数字（如 1=OpenAI, 3=Azure, 14=Anthropic 等）。
 * 注意：请勿与模型归属作用域渠道类型 `ChannelType` ('system' | 'team') 混淆。
 */
export type ChannelProviderType = number;

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
  /** 上游协议类型 (如 1=OpenAI, 14=Anthropic)，非 FastGPT 作用域 ChannelType */
  type: ChannelProviderType;
  key: string;
  base_url?: string;
  models: string[];
  model_mapping?: Record<string, string> | null;
  configs?: Record<string, any> | null;
  status: ChannelStatusEnum | ChannelStatusType;
  created_at?: number;
  priority?: number;
  sets?: string[] | null;
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
  /** 上游协议类型 (如 1=OpenAI, 14=Anthropic)，非 FastGPT 作用域 ChannelType */
  type: ChannelProviderType;
  model_mapping?: Record<string, string>;
  key?: string;
  name: string;
  base_url?: string;
  models: string[];
};
