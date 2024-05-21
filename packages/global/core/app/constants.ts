import { AppTTSConfigType, AppWhisperConfigType } from './type';

export enum AppTypeEnum {
  simple = 'simple',
  advanced = 'advanced'
}
export const AppTypeMap = {
  [AppTypeEnum.simple]: {
    label: 'simple'
  },
  [AppTypeEnum.advanced]: {
    label: 'advanced'
  }
};

export const defaultTTSConfig: AppTTSConfigType = { type: 'web' };

export const defaultWhisperConfig: AppWhisperConfigType = {
  open: false,
  autoSend: false,
  autoTTSResponse: false
};

export const defaultChatInputGuideConfig = {
  open: false,
  textList: [],
  customUrl: ''
};
