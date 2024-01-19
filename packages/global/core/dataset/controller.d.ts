import type { DatasetDataIndexItemType, DatasetDataSchemaType } from './type';

export type CreateDatasetDataProps = {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  chunkIndex?: number;
  q: string;
  a?: string;
  indexes?: Omit<DatasetDataIndexItemType, 'dataId'>[];
};

export type UpdateDatasetDataProps = {
  dataId: string;
  q?: string;
  a?: string;
  indexes?: (Omit<DatasetDataIndexItemType, 'dataId'> & {
    dataId?: string; // pg data id
  })[];
};

export type PatchIndexesProps = {
  type: 'create' | 'update' | 'delete' | 'unChange';
  index: Omit<DatasetDataIndexItemType, 'dataId'> & {
    dataId?: string;
  };
};
