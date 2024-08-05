import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { InitChatResponse } from './api';
import { i18nT } from '@fastgpt/web/i18n/utils';
export const defaultChatData: InitChatResponse = {
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
  title: i18nT('chat:new_chat'),
  variables: {},
  history: []
};
