import type { DatasetItemType } from '@/types/core/dataset';

export const defaultDatasetDetail: DatasetItemType = {
  _id: '',
  parentId: '',
  userId: '',
  teamId: '',
  tmbId: '',
  updateTime: new Date(),
  type: 'dataset',
  avatar: '/icon/logo.svg',
  name: '',
  tags: '',
  permission: 'private',
  isOwner: false,
  canWrite: false,
  vectorModel: {
    model: 'text-embedding-ada-002',
    name: 'Embedding-2',
    price: 0.2,
    defaultToken: 500,
    maxToken: 3000
  }
};
