// Collection processors
export const processCreateCollectionMetadata = (
  metadata: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  },
  t: any
) => {
  return {
    ...metadata,
    datasetType: t(metadata.datasetType as any)
  };
};

export const processUpdateCollectionMetadata = (
  metadata: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  },
  t: any
) => {
  return {
    ...metadata,
    datasetType: t(metadata.datasetType as any)
  };
};

export const processDeleteCollectionMetadata = (
  metadata: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  },
  t: any
) => {
  return {
    ...metadata,
    datasetType: t(metadata.datasetType as any)
  };
};

export const processRetrainCollectionMetadata = (
  metadata: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  },
  t: any
) => {
  return {
    ...metadata,
    datasetType: t(metadata.datasetType as any)
  };
};

export const createCollectionProcessors = (t: any) => ({
  CREATE_COLLECTION: (metadata: any) => processCreateCollectionMetadata(metadata, t),
  UPDATE_COLLECTION: (metadata: any) => processUpdateCollectionMetadata(metadata, t),
  DELETE_COLLECTION: (metadata: any) => processDeleteCollectionMetadata(metadata, t),
  RETRAIN_COLLECTION: (metadata: any) => processRetrainCollectionMetadata(metadata, t)
});
