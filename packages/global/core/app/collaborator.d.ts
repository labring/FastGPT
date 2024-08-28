import { UpdateClbPermissionProps } from '../../support/permission/collaborator';
import { PermissionValueType } from '../../support/permission/type';

export type UpdateAppCollaboratorBody = UpdateClbPermissionProps & {
  appId: string;
};

export type AppCollaboratorDeleteParams = {
  appId: string;
  tmbId: string;
};
