import { PermissionValueType } from '../../support/permission/type';

export type UpdateAppCollaboratorBody = {
  appId: string;
  tmbIds: string[];
  permission: PermissionValueType;
};

export type AppCollaboratorDeleteParams = {
  appId: string;
  tmbId: string;
};
