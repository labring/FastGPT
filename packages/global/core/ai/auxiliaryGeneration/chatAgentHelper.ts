import {
  AppTypeEnum,
  defaultAppSelectFileConfig,
  defaultQGConfig,
  defaultWhisperConfig
} from '../../app/constants';
import type { AppQGConfigType, AppWhisperConfigType } from '../../app/type';
import type { AppFileSelectConfigType } from '../../app/type/config.schema';

export const ChatAgentHelperAppName = 'Chat Agent Helper';
export const ChatAgentHelperAvatar = '/imgs/bot.svg';

export const chatAgentHelperFileSelectConfig: AppFileSelectConfigType = {
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

export const chatAgentHelperQuestionGuideConfig: AppQGConfigType = {
  ...defaultQGConfig,
  open: false
};

export const chatAgentHelperWhisperConfig: AppWhisperConfigType = {
  ...defaultWhisperConfig,
  open: false
};

/** 创建 ChatAgentHelper 专用 Chat 配置，避免调用方共享并误改全局对象。 */
export const createChatAgentHelperChatConfig = () => {
  return {
    fileSelectConfig: {
      ...chatAgentHelperFileSelectConfig,
      customFileExtensionList: [...(chatAgentHelperFileSelectConfig.customFileExtensionList ?? [])]
    },
    questionGuide: {
      ...chatAgentHelperQuestionGuideConfig
    },
    whisperConfig: {
      ...chatAgentHelperWhisperConfig
    }
  };
};

/** 创建 ChatAgentHelper 在通用 ChatBox 中使用的轻量 App 信息。 */
export const createChatAgentHelperAppConfig = () => {
  return {
    chatConfig: createChatAgentHelperChatConfig(),
    chatModels: [],
    name: ChatAgentHelperAppName,
    avatar: ChatAgentHelperAvatar,
    intro: '',
    type: AppTypeEnum.simple,
    pluginInputs: []
  };
};
