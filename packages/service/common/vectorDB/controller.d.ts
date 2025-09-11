import type { EmbeddingRecallItemType } from './type';

export type DeleteDatasetVectorProps = (
  | { id: string }
  | { datasetIds: string[]; collectionIds?: string[] }
  | { idList: string[] }
) & {
  teamId: string;
};
export type DelDatasetVectorCtrlProps = DeleteDatasetVectorProps & {
  retry?: number;
  tableName?: string;
};

export type InsertVectorProps = {
  teamId: string;
  datasetId: string;
  collectionId: string;
};
export type InsertVectorControllerProps = InsertVectorProps & {
  vectors: number[][];
  tableName?: string;
  table_des_index?: string;
  column_des_index?: string,
  column_val_index?: string,
  retry?: number;
};

export type EmbeddingRecallProps = {
  teamId: string;
  datasetIds: string[];

  forbidCollectionIdList: string[];
  filterCollectionIdList?: string[];
};
export type EmbeddingRecallCtrlProps = EmbeddingRecallProps & {
  vector: number[];
  limit: number;
  retry?: number;
};
export type EmbeddingRecallResponse = {
  results: EmbeddingRecallItemType[];
};

export type DatabaseEmbeddingRecallCtrlProps = EmbeddingRecallProps &{
  vector: number[];
  limit: number;
  tableName: string; // DBDatasetVectorTableName or DBDatasetValueVectorTableName
  retry?: number;
};

export type DatabaseEmbeddingRecallResponse = {
  results: Array<{
    id: string;
    collectionId: string;
    score: number;
    columnDesIndex?: string;
    columnValIndex?: string;
  }>;
};