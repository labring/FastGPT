import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';

export const processUpdateDatasetCollaboratorSpecific = (metadata: any) => {
  const permissionValue = parseInt(metadata.permission, 10);
  const permission = new DatasetPermission({ per: permissionValue });
  return {
    ...metadata,
    readPermission: permission.hasReadPer ? '✔' : '✘',
    writePermission: permission.hasWritePer ? '✔' : '✘',
    managePermission: permission.hasManagePer ? '✔' : '✘'
  };
};

export const createDatasetProcessors = {
  UPDATE_DATASET_COLLABORATOR: processUpdateDatasetCollaboratorSpecific
};
