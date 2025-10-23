import {
  type AppTTSConfigType,
  type AppFileSelectConfigType,
  type AppWhisperConfigType,
  type AppAutoExecuteConfigType,
  type AppQGConfigType
} from './type';

export enum AppTypeEnum {
  folder = 'folder',
  simple = 'simple',
  workflow = 'advanced',
  plugin = 'plugin',
  toolSet = 'toolSet', // 'mcp'
  httpToolSet = 'httpToolSet',
  tool = 'tool',
  hidden = 'hidden',

  // deprecated
  httpPlugin = 'httpPlugin'
}

export const AppFolderTypeList = [AppTypeEnum.folder, AppTypeEnum.httpPlugin];

export const defaultTTSConfig: AppTTSConfigType = { type: 'web' };

export const defaultAutoExecuteConfig: AppAutoExecuteConfigType = {
  open: false,
  defaultPrompt: ''
};

export const defaultWhisperConfig: AppWhisperConfigType = {
  open: false,
  autoSend: false,
  autoTTSResponse: false
};

export const defaultQGConfig: AppQGConfigType = {
  open: false,
  model: 'gpt-5',
  customPrompt: ''
};

export const defaultChatInputGuideConfig = {
  open: false,
  textList: [],
  customUrl: ''
};

export const defaultAppSelectFileConfig: AppFileSelectConfigType = {
  canSelectFile: false,
  canSelectImg: false,
  maxFiles: 10,
  canSelectVideo: false,
  canSelectAudio: false,
  canSelectCustomFileExtension: false,
  customFileExtensionList: []
};

export enum AppTemplateTypeEnum {
  recommendation = 'recommendation',
  writing = 'writing',
  imageGeneration = 'image-generation',
  webSearch = 'web-search',
  roleplay = 'roleplay',
  officeServices = 'office-services',

  // special type
  contribute = 'contribute'
}

export const defaultFileExtensionTypes = {
  canSelectFile: ['.pdf', '.docx', '.pptx', '.xlsx', '.txt', '.md', '.html', '.csv'],
  canSelectImg: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'],
  canSelectVideo: ['.mp4', '.mov', '.avi', '.mpeg', '.webm'],
  canSelectAudio: ['.mp3', '.wav', '.ogg', '.m4a', '.amr', '.mpga'],
  canSelectCustomFileExtension: []
};
export type FileExtensionKeyType = keyof typeof defaultFileExtensionTypes;
