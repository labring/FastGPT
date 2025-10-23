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
  maxFiles: 10
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
  docs: [
    '.pdf',
    '.docx',
    '.doc',
    '.pptx',
    '.ppt',
    '.xlsx',
    '.xls',
    '.txt',
    '.md',
    '.mdx',
    '.markdown',
    '.html',
    '.csv',
    '.eml',
    '.xml'
  ],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'],
  video: ['.mp4', '.mov', '.avi', '.mpeg', '.webm'],
  audio: ['.mp3', '.wav', '.ogg', '.m4a', '.amr', '.mpga']
};
