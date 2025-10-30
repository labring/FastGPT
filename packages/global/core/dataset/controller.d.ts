import type { DatasetDataIndexItemType, DatasetDataSchemaType } from './type';

export type CreateDatasetDataProps = {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  chunkIndex?: number;
  q: string;
  a?: string;
  imageId?: string;
  indexes?: Omit<DatasetDataIndexItemType, 'dataId'>[];
  metadata?: Record<string, any>;
  indexPrefix?: string;
};

export type UpdateDatasetDataProps = {
  dataId: string;

  q: string;
  a?: string;
  indexes?: (Omit<DatasetDataIndexItemType, 'dataId'> & {
    dataId?: string; // pg data id
  })[];
  metadata?: Record<string, any>;
  imageId?: string;
  indexPrefix?: string;
};

export type PatchIndexesProps =
  | {
      type: 'create';
      index: Omit<DatasetDataIndexItemType, 'dataId'> & {
        dataId?: string;
      };
    }
  | {
      type: 'update';
      index: DatasetDataIndexItemType;
    }
  | {
      type: 'delete';
      index: DatasetDataIndexItemType;
    }
  | {
      type: 'unChange';
      index: DatasetDataIndexItemType;
    };
