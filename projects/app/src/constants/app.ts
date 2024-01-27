import { AppDetailType } from '@fastgpt/global/core/app/type.d';
import type { OutLinkEditType } from '@fastgpt/global/support/outLink/type.d';

export const defaultApp: AppDetailType = {
  _id: '',
  userId: 'userId',
  name: '应用加载中',
  avatar: '/icon/logo.svg',
  intro: '',
  updateTime: Date.now(),
  teamId: '',
  tmbId: '',
  permission: 'private',
  tools: [],
  isOwner: false,
  canWrite: false,

  modules: [],
  type: 'simple',
  simpleTemplateId: 'fastgpt-universal'
};

export const defaultOutLinkForm: OutLinkEditType = {
  name: '',
  responseDetail: false,
  limit: {
    QPM: 100,
    credit: -1
  }
};

export enum TTSTypeEnum {
  none = 'none',
  web = 'web',
  model = 'model'
}
