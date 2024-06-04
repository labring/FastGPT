import { PermissionValueType } from './type';

export type CollaboratorItemType = {
  teamId: string;
  tmbId: string;
  permission: PermissionValueType;
  name: string;
  avatar: string;
};
