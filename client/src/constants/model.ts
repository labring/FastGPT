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
    expiredTime: new Date('2099/1/1 12:00'),
    QPM: 100,
    credit: -1
  }
};
