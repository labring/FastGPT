import type { UpdateAppCollaboratorBody } from 'core/app/collaborator';
import type { RequireOnlyOne } from '../../common/type/utils';
import { RequireAtLeastOne } from '../../common/type/utils';
import type { Permission } from './controller';
import type { PermissionValueType, RoleValueType } from './type';

export type CollaboratorIdType = RequireOnlyOne<{
  tmbId: string;
  groupId: string;
  orgId: string;
}>;

export type CollaboratorItemDetailType = {
  teamId: string;
  permission: Permission;
  name: string;
  avatar: string;
} & CollaboratorIdType;

export type CollaboratorItemType = {
  permission: PermissionValueType;
} & CollaboratorIdType;

export type UpdateClbPermissionProps = {
  collaborators: CollaboratorItemType[];
};

export type DeletePermissionQuery = CollaboratorIdType;

export type CollaboratorListType = {
  clbs: CollaboratorItemDetailType[];
  parentClbs?: CollaboratorItemDetailType[];
};
