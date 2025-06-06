import { defaultQAModels, defaultVectorModels } from '@fastgpt/global/core/ai/model';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  DatasetTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import type {
  DatasetCollectionItemType,
  DatasetItemType
} from '@fastgpt/global/core/dataset/type.d';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { i18nT } from '@fastgpt/web/i18n/utils';

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
  vlmModel: defaultQAModels[0],
  inheritPermission: true
};

export const defaultCollectionDetail: DatasetCollectionItemType = {
  _id: '',
  teamId: '',
  tmbId: '',
  datasetId: '',
  dataset: {
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
  trainingType: DatasetCollectionDataProcessModeEnum.chunk,
  chunkSize: 0,
  indexSize: 512,
  permission: new DatasetPermission(),
  indexAmount: 0
};

export const TrainingProcess = {
  waiting: {
    label: i18nT('dataset:process.Waiting'),
    value: 'waiting'
  },
  parsing: {
    label: i18nT('dataset:process.Parsing'),
    value: 'parsing'
  },
  parseImage: {
    label: i18nT('dataset:process.Parse_Image'),
    value: 'parseImage'
  },
  getQA: {
    label: i18nT('dataset:process.Get QA'),
    value: 'getQA'
  },
  imageIndex: {
    label: i18nT('dataset:process.Image_Index'),
    value: 'imageIndex'
  },
  autoIndex: {
    label: i18nT('dataset:process.Auto_Index'),
    value: 'autoIndex'
  },
  vectorizing: {
    label: i18nT('dataset:process.Vectorizing'),
    value: 'vectorizing'
  },
  isReady: {
    label: i18nT('dataset:process.Is_Ready'),
    value: 'isReady'
  }
};
