import { defaultQAModels, defaultVectorModels } from '@fastgpt/global/core/ai/model';
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
  intro: '',
  status: 'active',
  permission: 'private',
  isOwner: false,
  canWrite: false,
  vectorModel: defaultVectorModels[0],
  agentModel: defaultQAModels[0]
};

export const defaultCollectionDetail: DatasetCollectionItemType = {
  _id: '',
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
    intro: '',
    status: 'active',
    permission: 'private',
    vectorModel: defaultVectorModels[0].model,
    agentModel: defaultQAModels[0].model
  },
  parentId: '',
  name: '',
  type: 'file',
  updateTime: new Date(),
  canWrite: false,
  sourceName: '',
  sourceId: '',
  createTime: new Date(),
  trainingType: 'chunk',
  chunkSize: 0
};
