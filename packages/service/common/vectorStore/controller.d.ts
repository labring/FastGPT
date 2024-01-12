export type DeleteDatasetVectorProps = {
  id?: string;
  datasetIds?: string[];
  collectionIds?: string[];

  collectionId?: string;
  dataIds?: string[];
};

export type InsertVectorProps = {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  dataId: string;
};

export type EmbeddingRecallProps = {
  similarity?: number;
  datasetIds: string[];
};
