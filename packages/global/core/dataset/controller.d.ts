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
};

export type UpdateDatasetDataProps = {
  dataId: string;

  q: string;
  a?: string;
  indexes?: (Omit<DatasetDataIndexItemType, 'dataId'> & {
    dataId?: string; // pg data id
  })[];
  imageId?: string;
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
