import type { AppSchema } from '@/types/mongoSchema';
import type { OutLinkEditType } from '@/types/support/outLink';

export const defaultApp: AppSchema = {
  _id: '',
  userId: 'userId',
  name: '模型加载中',
  type: 'basic',
  avatar: '/icon/logo.svg',
  intro: '',
  updateTime: Date.now(),
  share: {
    isShare: false,
    isShareDetail: false,
    collection: 0
  },
  modules: []
};

export const defaultOutLinkForm: OutLinkEditType = {
  name: '',
  responseDetail: false,
  limit: {
    QPM: 100,
    credit: -1
  }
};
