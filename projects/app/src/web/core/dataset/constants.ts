import { defaultQAModels, defaultVectorModels } from '@fastgpt/global/core/ai/model';
import {
  DatasetCollectionTypeEnum,
  DatasetTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import type {
  DatasetCollectionItemType,
  DatasetItemType
} from '@fastgpt/global/core/dataset/type.d';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';

export const defaultDatasetDetail: DatasetItemType = {
  _id: '',
  parentId: '',
  userId: '',
  teamId: '',
  tmbId: '',
  updateTime: new Date(),
  type: DatasetTypeEnum.dataset,
  avatar: '/icon/logo.svg',
  name: '',
  intro: '',
  status: 'active',
  permission: new DatasetPermission(),
  vectorModel: defaultVectorModels[0],
  agentModel: defaultQAModels[0],
  inheritPermission: true
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
    type: DatasetTypeEnum.dataset,
    avatar: '/icon/logo.svg',
    name: '',
    intro: '',
    status: 'active',
    vectorModel: defaultVectorModels[0].model,
    agentModel: defaultQAModels[0].model,
    inheritPermission: true
  },
  tags: [],
  parentId: '',
  name: '',
  type: DatasetCollectionTypeEnum.file,
  updateTime: new Date(),
  sourceName: '',
  sourceId: '',
  createTime: new Date(),
  trainingType: TrainingModeEnum.chunk,
  chunkSize: 0,
  permission: new DatasetPermission()
};

export enum ImportProcessWayEnum {
  auto = 'auto',
  custom = 'custom'
}
