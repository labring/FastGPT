import { i18nT } from '../../../../web/i18n/utils';

export enum DatasetDataIndexTypeEnum {
  default = 'default',
  custom = 'custom',
  summary = 'summary',
  question = 'question',
  image = 'image'
}

export const DatasetDataIndexMap: Record<
  `${DatasetDataIndexTypeEnum}`,
  {
    label: any;
    color: string;
  }
> = {
  [DatasetDataIndexTypeEnum.default]: {
    label: i18nT('common:data_index_default'),
    color: 'gray'
  },
  [DatasetDataIndexTypeEnum.custom]: {
    label: i18nT('common:data_index_custom'),
    color: 'blue'
  },
  [DatasetDataIndexTypeEnum.summary]: {
    label: i18nT('common:data_index_summary'),
    color: 'green'
  },
  [DatasetDataIndexTypeEnum.question]: {
    label: i18nT('common:data_index_question'),
    color: 'red'
  },
  [DatasetDataIndexTypeEnum.image]: {
    label: i18nT('dataset:data_index_image'),
    color: 'purple'
  }
};
export const defaultDatasetIndexData = DatasetDataIndexMap[DatasetDataIndexTypeEnum.custom];
export const getDatasetIndexMapData = (type: `${DatasetDataIndexTypeEnum}`) => {
  return DatasetDataIndexMap[type] || defaultDatasetIndexData;
};
