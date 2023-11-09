import { AppDetailType } from '@fastgpt/global/core/app/type.d';
import type { OutLinkEditType } from '@fastgpt/global/support/outLink/type.d';

export const defaultApp: AppDetailType = {
  _id: '',
  userId: 'userId',
  name: '模型加载中',
  type: 'basic',
  avatar: '/icon/logo.svg',
  intro: '',
  updateTime: Date.now(),
  modules: [],
  teamId: '',
  tmbId: '',
  permission: 'private',
  isOwner: false,
  canWrite: false
};

export const defaultOutLinkForm: OutLinkEditType = {
  name: '',
  responseDetail: false,
  limit: {
    QPM: 100,
    credit: -1
  }
};

/* module special */
export enum SystemInputEnum {
  'welcomeText' = 'welcomeText',
  'variables' = 'variables',
  'switch' = 'switch', // a trigger switch
  'history' = 'history',
  'userChatInput' = 'userChatInput',
  'questionGuide' = 'questionGuide',
  'tts' = 'tts',
  isResponseAnswerText = 'isResponseAnswerText'
}
export enum SystemOutputEnum {
  finish = 'finish'
}

export enum VariableInputEnum {
  input = 'input',
  select = 'select'
}

export enum TTSTypeEnum {
  none = 'none',
  web = 'web',
  model = 'model'
}
