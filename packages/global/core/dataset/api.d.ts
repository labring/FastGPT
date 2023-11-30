import { DatasetDataIndexItemType } from './type';
import {
  DatasetCollectionStatusEnum,
  DatasetCollectionTrainingModeEnum,
  DatasetCollectionTypeEnum
} from './constant';

/* ================= dataset ===================== */

/* ================= collection ===================== */
export type CreateDatasetCollectionParams = {
  datasetId: string;
  parentId?: string;
  name: string;
  type: `${DatasetCollectionTypeEnum}`;
  status?: `${DatasetCollectionStatusEnum}`;
  trainingType?: `${DatasetCollectionTrainingModeEnum}`;
  chunkSize?: number;
  fileId?: string;
  rawLink?: string;
  metadata?: Record<string, any>;
};

/* ================= data ===================== */
export type PgSearchRawType = {
  id: string;
  team_id: string;
  tmb_id: string;
  collection_id: string;
  data_id: string;
  score: number;
};
export type PushDatasetDataChunkProps = {
  q: string; // embedding content
  a?: string; // bonus content
  indexes?: Omit<DatasetDataIndexItemType, 'dataId'>[];
};
