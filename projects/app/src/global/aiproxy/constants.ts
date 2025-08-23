import { type ChannelInfoType } from './type';
import { i18nT } from '@fastgpt/web/i18n/utils';

export enum ChannelStatusEnum {
  ChannelStatusUnknown = 0,
  ChannelStatusEnabled = 1,
  ChannelStatusDisabled = 2,
  ChannelStatusAutoDisabled = 3
}
export const ChannelStautsMap = {
  [ChannelStatusEnum.ChannelStatusUnknown]: {
    label: i18nT('account_model:channel_status_unknown'),
    colorSchema: 'gray'
  },
  [ChannelStatusEnum.ChannelStatusEnabled]: {
    label: i18nT('account_model:channel_status_enabled'),
    colorSchema: 'green'
  },
  [ChannelStatusEnum.ChannelStatusDisabled]: {
    label: i18nT('account_model:channel_status_disabled'),
    colorSchema: 'red'
  },
  [ChannelStatusEnum.ChannelStatusAutoDisabled]: {
    label: i18nT('account_model:channel_status_auto_disabled'),
    colorSchema: 'gray'
  }
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
  priority: 0
};
