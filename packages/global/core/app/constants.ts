import {
  type AppTTSConfigType,
  type AppWhisperConfigType,
  type AppAutoExecuteConfigType,
  type AppQGConfigType
} from './type';
import type { AppFileSelectConfigType } from './type/config.schema';
import { i18nT } from '../../common/i18n/utils';
import { FlowNodeTemplateTypeEnum } from '../workflow/constants';
import { type TemplateTypeSchemaType } from './type';

export enum AppTypeEnum {
  folder = 'folder',
  toolFolder = 'toolFolder',
  simple = 'simple',
  chatAgent = 'chatAgent',
  workflow = 'advanced',
  workflowTool = 'plugin',
  mcpToolSet = 'toolSet', // 'mcp'
  httpToolSet = 'httpToolSet',
  hidden = 'hidden',

  // deprecated
  tool = 'tool',
  httpPlugin = 'httpPlugin',
  assistant = 'assistant'
}

export const AppFolderTypeList = [
  AppTypeEnum.folder,
  AppTypeEnum.toolFolder,
  AppTypeEnum.httpPlugin
];

export const ToolTypeList = [
  AppTypeEnum.mcpToolSet,
  AppTypeEnum.httpToolSet,
  AppTypeEnum.workflowTool
];
export const AppTypeList = [AppTypeEnum.simple, AppTypeEnum.chatAgent, AppTypeEnum.workflow, AppTypeEnum.assistant];

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
  maxFiles: 10,
  canSelectFile: false,
  canSelectImg: false,
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
export const AssistantGlobalVarKey = {
  FAQ_ANSWER_MODE: 'utjZSg8f',
  FALLBACK_REPLY: 'byG7WNk4',
  ENABLE_FALLBACK_REPLY: 'vKEVhtS6'
} as const;

export const workflowSystemNodeTemplateList: {
  type: string;
  label: string;
}[] = [
  {
    type: FlowNodeTemplateTypeEnum.systemInput,
    label: i18nT('common:core.module.template.System input module')
  },
  {
    type: FlowNodeTemplateTypeEnum.ai,
    label: i18nT('common:core.module.template.AI function')
  },

  {
    type: FlowNodeTemplateTypeEnum.interactive,
    label: i18nT('common:core.workflow.template.Interactive')
  },
  {
    type: FlowNodeTemplateTypeEnum.tools,
    label: i18nT('app:tool_type_tools')
  },
  {
    type: FlowNodeTemplateTypeEnum.other,
    label: i18nT('common:Other')
  }
];

export const defaultTemplateTypes: TemplateTypeSchemaType[] = [
  {
    typeName: i18nT('common:templateTags.Writing'),
    typeId: AppTemplateTypeEnum.writing,
    typeOrder: 0
  },
  {
    typeName: i18nT('common:templateTags.Image_generation'),
    typeId: AppTemplateTypeEnum.imageGeneration,
    typeOrder: 1
  },
  {
    typeName: i18nT('common:templateTags.Web_search'),
    typeId: AppTemplateTypeEnum.webSearch,
    typeOrder: 2
  },
  {
    typeName: i18nT('common:templateTags.Roleplay'),
    typeId: AppTemplateTypeEnum.roleplay,
    typeOrder: 3
  },
  {
    typeName: i18nT('common:templateTags.Office_services'),
    typeId: AppTemplateTypeEnum.officeServices,
    typeOrder: 4
  }
];

export const defaultFileExtensionTypes = {
  canSelectFile: ['.pdf', '.docx', '.pptx', '.xls', '.xlsx', '.txt', '.md', '.html', '.csv'],
  canSelectImg: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'],
  canSelectVideo: ['.mp4', '.mov', '.avi', '.mpeg', '.webm'],
  canSelectAudio: ['.mp3', '.wav', '.ogg', '.m4a', '.amr', '.mpga'],
  canSelectCustomFileExtension: []
};
export type FileExtensionKeyType = keyof typeof defaultFileExtensionTypes;
export const getUploadFileType = ({
  canSelectFile,
  canSelectImg,
  canSelectVideo,
  canSelectAudio,
  canSelectCustomFileExtension,
  customFileExtensionList
}: {
  canSelectFile?: boolean;
  canSelectImg?: boolean;
  canSelectVideo?: boolean;
  canSelectAudio?: boolean;
  canSelectCustomFileExtension?: boolean;
  customFileExtensionList?: string[];
}) => {
  const types: string[] = [];
  if (canSelectFile) {
    types.push(...defaultFileExtensionTypes.canSelectFile);
  }
  if (canSelectImg) {
    types.push(...defaultFileExtensionTypes.canSelectImg);
  }
  if (canSelectVideo) {
    types.push(...defaultFileExtensionTypes.canSelectVideo);
  }
  if (canSelectAudio) {
    types.push(...defaultFileExtensionTypes.canSelectAudio);
  }
  if (canSelectCustomFileExtension && customFileExtensionList) {
    types.push(...customFileExtensionList);
  }
  return types.join(', ');
};

