import {
  AppTTSConfigType,
  AppFileSelectConfigType,
  AppWhisperConfigType,
  AppAutoExecuteConfigType,
  AppQGConfigType
} from './type';

export enum AppTypeEnum {
  folder = 'folder',
  simple = 'simple',
  workflow = 'advanced',
  plugin = 'plugin',
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
  model: 'gpt-4o-mini',
  customPrompt: `你是一名AI助理，任务是根据对话历史预测用户的下一个问题。你的目标是生成3个潜在问题，引导用户继续对话。生成这些问题时，请遵守以下规则：

  1.使用与用户在历史会话中最后一个问题相同的语言。
  2.每个问题长度控制在20个字符以内。

  分析提供给您的对话历史，并将其用作上下文，以生成相关和引人入胜的后续问题。您的预测应该是当前主题或用户可能有兴趣进一步探索的相关领域的逻辑扩展。

  记得保持与现有对话的语气和风格的一致性，同时提供多样化的选项供用户选择。您的目标是保持对话自然流畅，并帮助用户深入探讨主题或探索相关主题。`
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

export const defaultDatasetMaxTokens = 16000;
