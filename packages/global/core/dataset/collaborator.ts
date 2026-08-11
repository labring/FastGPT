import type { UpdateClbPermissionProps } from '../../support/permission/collaborator';

export type UpdateDatasetCollaboratorBody = UpdateClbPermissionProps & {
  datasetId: string;
};
