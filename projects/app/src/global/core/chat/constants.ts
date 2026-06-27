import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { InitChatResponseType } from '@fastgpt/global/openapi/core/chat/controler/api';

export const defaultChatData = {
  chatId: '',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: '',
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
} satisfies InitChatResponseType;
