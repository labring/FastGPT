export type DeleteDatasetVectorProps = {
  teamId: string;

  id?: string;
  datasetIds?: string[];
  collectionIds?: string[];
  idList?: string[];
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
