import { VectorModelItemType } from '../../model';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type.d';

export type DatasetsItemType = Omit<DatasetSchemaType, 'vectorModel'> & {
  vectorModel: VectorModelItemType;
};

export type DatasetItemType = {
  _id: string;
  avatar: string;
  name: string;
  userId: string;
  vectorModel: VectorModelItemType;
  tags: string;
};

export type DatasetPathItemType = {
  parentId: string;
  parentName: string;
};

export type SelectedDatasetType = { datasetId: string; vectorModel: VectorModelItemType }[];
