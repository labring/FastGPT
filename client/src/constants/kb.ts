import type { KbItemType } from '@/types/plugin';

export const defaultKbDetail: KbItemType = {
  _id: '',
  userId: '',
  avatar: '/icon/logo.svg',
  name: '',
  tags: '',
  vectorModel: {
    model: 'text-embedding-ada-002',
    name: 'Embedding-2',
    price: 0.2,
    defaultToken: 500,
    maxToken: 3000
  }
};
