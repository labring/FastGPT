// Data processors
export const processCreateDataMetadata = (
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

export const processUpdateDataMetadata = (
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

export const processDeleteDataMetadata = (
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

export const processSearchTestMetadata = (
  metadata: {
    name?: string;
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

export const createDataProcessors = (t: any) => ({
  CREATE_DATA: (metadata: any) => processCreateDataMetadata(metadata, t),
  UPDATE_DATA: (metadata: any) => processUpdateDataMetadata(metadata, t),
  DELETE_DATA: (metadata: any) => processDeleteDataMetadata(metadata, t),
  SEARCH_TEST: (metadata: any) => processSearchTestMetadata(metadata, t)
});
