export type DeleteDatasetVectorProps = (
  | { id: string }
  | { datasetIds: string[]; collectionIds?: string[] }
  | { idList: string[] }
) & {
  teamId: string;
};

export type InsertVectorProps = {
  teamId: string;
  datasetId: string;
  collectionId: string;
};

export type EmbeddingRecallProps = {
  datasetIds: string[];
  similarity?: number;
  efSearch?: number;
};
