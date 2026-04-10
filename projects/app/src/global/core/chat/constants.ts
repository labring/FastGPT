import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { InitChatResponseType } from '@fastgpt/global/openapi/core/chat/controler/api';

export const defaultChatData: InitChatResponseType = {
  chatId: '',
  appId: '',
  app: {
    name: 'Loading',
    avatar: '/icon/logo.svg',
    intro: '',
    canUse: false,
    type: AppTypeEnum.simple,
    pluginInputs: []
  },
  title: '',
  variables: {}
};
