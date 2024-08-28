import { AppTTSConfigType, AppFileSelectConfigType, AppWhisperConfigType } from './type';

export enum AppTypeEnum {
  folder = 'folder',
  simple = 'simple',
  workflow = 'advanced',
  plugin = 'plugin',
  httpPlugin = 'httpPlugin'
}

export const AppFolderTypeList = [AppTypeEnum.folder, AppTypeEnum.httpPlugin];

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

export const defaultAppSelectFileConfig: AppFileSelectConfigType = {
  canSelectFile: false,
  canSelectImg: false,
  maxFiles: 10
};

export enum AppTemplateTypeEnum {
  recommendation = 'recommendation',
  writing = 'writing',
  imageGeneration = 'image-generation',
  webSearch = 'web-search',
  roleplay = 'roleplay',
  officeServices = 'office-services'
}
