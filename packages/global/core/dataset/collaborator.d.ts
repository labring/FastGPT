import { UpdateClbPermissionProps } from '../../support/permission/collaborator';
import { PermissionValueType } from '../../support/permission/type';

export type UpdateDatasetCollaboratorBody = UpdateClbPermissionProps & {
  datasetId: string;
};

export type DatasetCollaboratorDeleteParams = {
  datasetId: string;
  tmbId: string;
};
