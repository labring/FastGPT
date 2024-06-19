import { AppTTSConfigType, AppWhisperConfigType } from './type';

export enum AppTypeEnum {
  folder = 'folder',
  simple = 'simple',
  workflow = 'advanced',
  plugin = 'plugin',
  httpPlugin = 'httpPlugin'
}

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
