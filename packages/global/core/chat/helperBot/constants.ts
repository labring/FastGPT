import {
  AppTypeEnum,
  defaultAppSelectFileConfig,
  defaultQGConfig,
  defaultWhisperConfig
} from '../../app/constants';
import type { AppQGConfigType, AppWhisperConfigType } from '../../app/type';
import type { AppFileSelectConfigType } from '../../app/type/config.schema';

export const HelperBotAppName = 'Top Agent';
export const HelperBotAvatar = '/imgs/bot.svg';

export const helperBotFileSelectConfig: AppFileSelectConfigType = {
  ...defaultAppSelectFileConfig,
  maxFiles: 10,
  canSelectFile: true,
  canSelectImg: true,
  canSelectVideo: true,
  canSelectAudio: true,
  customPdfParse: false,
  canSelectCustomFileExtension: true,
  customFileExtensionList: []
};

export const helperBotQuestionGuideConfig: AppQGConfigType = {
  ...defaultQGConfig,
  open: false
};

export const helperBotWhisperConfig: AppWhisperConfigType = {
  ...defaultWhisperConfig,
  open: false
};

/** 创建 HelperBot 专用 Chat 配置，避免调用方共享并误改全局对象。 */
export const createHelperBotChatConfig = () => {
  return {
    fileSelectConfig: {
      ...helperBotFileSelectConfig,
      customFileExtensionList: [...(helperBotFileSelectConfig.customFileExtensionList ?? [])]
    },
    questionGuide: {
      ...helperBotQuestionGuideConfig
    },
    whisperConfig: {
      ...helperBotWhisperConfig
    }
  };
};

/** 创建 HelperBot 在通用 ChatBox 中使用的轻量 App 信息。 */
export const createHelperBotAppConfig = () => {
  return {
    chatConfig: createHelperBotChatConfig(),
    chatModels: [],
    name: HelperBotAppName,
    avatar: HelperBotAvatar,
    intro: '',
    type: AppTypeEnum.simple,
    pluginInputs: []
  };
};
