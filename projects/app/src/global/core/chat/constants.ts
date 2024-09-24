import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { InitChatResponse } from './api';

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
  title: '',
  variables: {}
};

export enum GetChatTypeEnum {
  normal = 'normal',
  outLink = 'outLink',
  team = 'team'
}
