import type {
  DatasetCollectionItemType,
  DatasetItemType
} from '@fastgpt/global/core/dataset/type.d';

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
  tags: [],
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

export const defaultCollectionDetail: DatasetCollectionItemType = {
  _id: '',
  userId: '',
  teamId: '',
  tmbId: '',
  datasetId: {
    _id: '',
    parentId: '',
    userId: '',
    teamId: '',
    tmbId: '',
    updateTime: new Date(),
    type: 'dataset',
    avatar: '/icon/logo.svg',
    name: '',
    tags: [],
    permission: 'private',
    vectorModel: 'text-embedding-ada-002'
  },
  parentId: '',
  name: '',
  type: 'file',
  updateTime: new Date(),
  metadata: {},
  canWrite: false,
  sourceName: '',
  sourceId: ''
};
