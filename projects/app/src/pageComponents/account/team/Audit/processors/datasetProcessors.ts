import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { CollectionPermission } from '@fastgpt/global/support/permission/collection/controller';

const processCollaboratorPermission = (
  metadata: any,
  permission: { hasReadPer: boolean; hasWritePer: boolean; hasManagePer: boolean }
) => ({
  ...metadata,
  readPermission: permission.hasReadPer ? '✔' : '✘',
  writePermission: permission.hasWritePer ? '✔' : '✘',
  managePermission: permission.hasManagePer ? '✔' : '✘'
});

export const processUpdateDatasetCollaboratorSpecific = (metadata: any) =>
  processCollaboratorPermission(
    metadata,
    new DatasetPermission({ role: parseInt(metadata.permission, 10) })
  );

export const processUpdateCollectionCollaboratorSpecific = (metadata: any) =>
  processCollaboratorPermission(
    metadata,
    new CollectionPermission({ role: parseInt(metadata.permission, 10) })
  );

export const createDatasetProcessors = {
  UPDATE_DATASET_COLLABORATOR: processUpdateDatasetCollaboratorSpecific,
  UPDATE_COLLECTION_COLLABORATOR: processUpdateCollectionCollaboratorSpecific
};
