import { DatasetDataIndexItemType } from './type';

/* ================= dataset ===================== */

/* ================= collection ===================== */

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
