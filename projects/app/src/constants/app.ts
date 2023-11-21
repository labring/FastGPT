import { AppDetailType } from '@fastgpt/global/core/app/type.d';
import type { OutLinkEditType } from '@fastgpt/global/support/outLink/type.d';

export const defaultApp: AppDetailType = {
  _id: '',
  userId: 'userId',
  name: '模型加载中',
  type: 'simple',
  simpleTemplateId: 'fastgpt-universal',
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

export enum TTSTypeEnum {
  none = 'none',
  web = 'web',
  model = 'model'
}
