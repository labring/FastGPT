import { type UpdateClbPermissionProps } from '../../support/permission/collaborator';

export type UpdateAppCollaboratorBody = UpdateClbPermissionProps & {
  appId: string;
};
