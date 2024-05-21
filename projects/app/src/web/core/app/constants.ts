import { AppDetailType } from '@fastgpt/global/core/app/type.d';
import type { FeishuType, OutLinkEditType } from '@fastgpt/global/support/outLink/type.d';

export const defaultApp: AppDetailType = {
  _id: '',
  name: '应用加载中',
  type: 'simple',
  avatar: '/icon/logo.svg',
  intro: '',
  updateTime: Date.now(),
  modules: [],
  chatConfig: {},
  teamId: '',
  tmbId: '',
  permission: 'private',
  isOwner: false,
  canWrite: false,
  teamTags: [],
  edges: [],
  version: 'v2'
};

export const defaultOutLinkForm: OutLinkEditType = {
  name: '',
  responseDetail: false,
  limit: {
    QPM: 100,
    maxUsagePoints: -1
  }
};

// export const defaultWecomOutLinkForm: OutLinkConfigEditType = {
//   name: '',
//   wecomConfig: {
//     ReplyLimit: false,
//     defaultResponse: '',
//     immediateResponse: false,
//     WXWORK_TOKEN: '',
//     WXWORK_AESKEY: '',
//     WXWORK_SECRET: '',
//     WXWORD_ID: ''
//   },
//   limit: {
//     QPM: 100,
//     maxUsagePoints: -1
//   }
// };

export const defaultFeishuOutLinkForm: OutLinkEditType<FeishuType> = {
  name: '',
  limit: {
    QPM: 100,
    maxUsagePoints: -1
  },
  responseDetail: false
};

export enum TTSTypeEnum {
  none = 'none',
  web = 'web',
  model = 'model'
}
