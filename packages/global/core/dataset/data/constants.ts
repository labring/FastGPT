import { i18nT } from '../../../common/i18n/utils';

export enum DatasetDataIndexTypeEnum {
  default = 'default', // 默认文本索引
  imageEmbedding = 'imageEmbedding', // 默认图片向量

  summary = 'summary', // 摘要，系统生成
  question = 'question', // 补全问题，系统生成
  image = 'image', // 图片描述，系统生成
  custom = 'custom'
}

/** 数据索引状态。新数据先写入 indexing，向量和全文索引完成后变为 indexed。 */
export enum DatasetDataIndexStatusEnum {
  indexing = 'indexing',
  indexed = 'indexed',
  error = 'error'
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
  },
  [DatasetDataIndexTypeEnum.imageEmbedding]: {
    label: i18nT('dataset:data_index_image_embedding'),
    color: 'purple'
  }
};
export const defaultDatasetIndexData = DatasetDataIndexMap[DatasetDataIndexTypeEnum.custom];
export const getDatasetIndexMapData = (type: `${DatasetDataIndexTypeEnum}`) => {
  return DatasetDataIndexMap[type] || defaultDatasetIndexData;
};

/** 数据索引状态的展示信息。字段缺失的历史数据按 indexed 展示。 */
export const DatasetDataIndexStatusMap: Record<
  `${DatasetDataIndexStatusEnum}`,
  {
    label: any;
    colorSchema: 'gray' | 'blue' | 'green';
  }
> = {
  [DatasetDataIndexStatusEnum.indexing]: {
    label: i18nT('dataset:data_index_status_indexing'),
    colorSchema: 'blue'
  },
  [DatasetDataIndexStatusEnum.indexed]: {
    label: i18nT('dataset:data_index_status_indexed'),
    colorSchema: 'green'
  },
  [DatasetDataIndexStatusEnum.error]: {
    label: i18nT('dataset:data_index_status_error'),
    colorSchema: 'gray'
  }
};

export const getDatasetDataIndexStatusMapData = (status?: DatasetDataIndexStatusEnum) =>
  DatasetDataIndexStatusMap[status ?? DatasetDataIndexStatusEnum.indexed] ??
  DatasetDataIndexStatusMap[DatasetDataIndexStatusEnum.indexed];
