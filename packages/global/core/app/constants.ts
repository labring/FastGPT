import {
  type AppTTSConfigType,
  type AppWhisperConfigType,
  type AppAutoExecuteConfigType,
  type AppQGConfigType
} from './type';
import type { AppFileSelectConfigType } from './type/config.schema';
import { documentFileExtensions } from '../../common/file/constants';

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
  httpPlugin = 'httpPlugin'
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
export const AppTypeList = [AppTypeEnum.simple, AppTypeEnum.chatAgent, AppTypeEnum.workflow];

export enum AppListSortEnum {
  updateTimeDesc = 'updateTimeDesc',
  createTimeDesc = 'createTimeDesc',
  createTimeAsc = 'createTimeAsc'
}

export const appListSortMongoMap: Record<AppListSortEnum, Record<string, 1 | -1>> = {
  [AppListSortEnum.updateTimeDesc]: { updateTime: -1 },
  [AppListSortEnum.createTimeDesc]: { createTime: -1 },
  [AppListSortEnum.createTimeAsc]: { createTime: 1 }
};

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

export const defaultFileExtensionTypes = {
  canSelectFile: [...documentFileExtensions],
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

/** 判断聊天上传文件是否符合应用文件选择配置 */
export const isChatFileAllowedBySelectConfig = ({
  filename,
  contentType,
  fileType,
  fileSelectConfig
}: {
  filename: string;
  contentType?: string;
  fileType: 'image' | 'audio' | 'video' | 'file';
  fileSelectConfig: AppFileSelectConfigType;
}) => {
  const allowedExtensions = getUploadFileType(fileSelectConfig)
    .split(',')
    .map((extension) => {
      const normalized = extension.trim().toLowerCase();
      return normalized ? (normalized.startsWith('.') ? normalized : `.${normalized}`) : '';
    })
    .filter(Boolean);
  const normalizedFilename = filename.trim().toLowerCase();
  const lastDotIndex = normalizedFilename.lastIndexOf('.');
  const extension = lastDotIndex >= 0 ? normalizedFilename.slice(lastDotIndex) : '';

  if (extension) return allowedExtensions.includes(extension);

  const mimeCategory = contentType?.trim().toLowerCase().split('/')[0];
  if (mimeCategory === 'image' || mimeCategory === 'audio' || mimeCategory === 'video') {
    return (
      fileSelectConfig[
        mimeCategory === 'image'
          ? 'canSelectImg'
          : mimeCategory === 'audio'
            ? 'canSelectAudio'
            : 'canSelectVideo'
      ] === true
    );
  }

  if (contentType?.trim()) return false;

  return fileType === 'image'
    ? fileSelectConfig.canSelectImg === true
    : fileType === 'video'
      ? fileSelectConfig.canSelectVideo === true
      : fileType === 'audio'
        ? fileSelectConfig.canSelectAudio === true
        : fileSelectConfig.canSelectFile === true;
};
