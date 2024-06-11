import { Permission } from './controller';
import { PermissionValueType } from './type';

export type CollaboratorItemType = {
  teamId: string;
  tmbId: string;
  permission: Permission;
  name: string;
  avatar: string;
};
