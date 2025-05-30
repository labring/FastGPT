// Dataset processors
export const processCreateDatasetMetadata = (
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

export const processUpdateDatasetMetadata = (
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

export const processDeleteDatasetMetadata = (
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

export const processMoveDatasetMetadata = (
  metadata: {
    name?: string;
    datasetName: string;
    targetFolderName: string;
    datasetType: string;
  },
  t: any
) => {
  return {
    ...metadata,
    datasetType: t(metadata.datasetType as any)
  };
};

export const processExportDatasetMetadata = (
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

export const processUpdateDatasetCollaboratorMetadata = (
  metadata: {
    name?: string;
    datasetName: string;
    datasetType: string;
    tmbList: string[];
    groupList: string[];
    orgList: string[];
    permission: string;
  },
  t: any
) => {
  return {
    ...metadata,
    datasetType: t(metadata.datasetType as any)
  };
};

export const processDeleteDatasetCollaboratorMetadata = (
  metadata: {
    name?: string;
    datasetName: string;
    datasetType: string;
    itemName: string;
    itemValueName: string;
  },
  t: any
) => {
  return {
    ...metadata,
    datasetType: t(metadata.datasetType as any)
  };
};

export const processTransferDatasetOwnershipMetadata = (
  metadata: {
    name?: string;
    datasetName: string;
    datasetType: string;
    oldOwnerName: string;
    newOwnerName: string;
  },
  t: any
) => {
  return {
    ...metadata,
    datasetType: t(metadata.datasetType as any)
  };
};

export const createBasicDatasetProcessor = (t: any) => (metadata: any) => metadata;

export const createDatasetProcessors = (t: any) => ({
  CREATE_DATASET: (metadata: any) => processCreateDatasetMetadata(metadata, t),
  UPDATE_DATASET: (metadata: any) => processUpdateDatasetMetadata(metadata, t),
  DELETE_DATASET: (metadata: any) => processDeleteDatasetMetadata(metadata, t),
  MOVE_DATASET: (metadata: any) => processMoveDatasetMetadata(metadata, t),
  UPDATE_DATASET_COLLABORATOR: (metadata: any) =>
    processUpdateDatasetCollaboratorMetadata(metadata, t),
  DELETE_DATASET_COLLABORATOR: (metadata: any) =>
    processDeleteDatasetCollaboratorMetadata(metadata, t),
  TRANSFER_DATASET_OWNERSHIP: (metadata: any) =>
    processTransferDatasetOwnershipMetadata(metadata, t),
  EXPORT_DATASET: (metadata: any) => processExportDatasetMetadata(metadata, t),
  CREATE_DATASET_FOLDER: createBasicDatasetProcessor(t)
});
