import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import {
  DatasetCollectionSchemaType,
  DatasetDataSchemaType
} from '@fastgpt/global/core/dataset/type.d';

/* ================= dataset ===================== */

/* ================= collection ===================== */
export type DatasetCollectionsListItemType = {
  _id: string;
  parentId?: string;
  tmbId: string;
  name: string;
  type: DatasetCollectionSchemaType['type'];
  updateTime: Date;
  dataAmount: number;
  trainingAmount: number;
  fileId?: string;
  rawLink?: string;
  canWrite: boolean;
};

/* ================= data ===================== */
export type DatasetDataListItemType = {
  _id: string;
  datasetId: string;
  collectionId: string;
  q: string; // embedding content
  a: string; // bonus content
  chunkIndex?: number;
  indexes: DatasetDataSchemaType['indexes'];
};
