import { RequireAtLeastOne, RequireOnlyOne } from '../../common/type/utils';
import { Permission } from './controller';
import { PermissionValueType } from './type';

export type CollaboratorItemType = {
  teamId: string;
  permission: Permission;
  name: string;
  avatar: string;
} & RequireOnlyOne<{
  tmbId: string;
  groupId: string;
}>;

export type UpdateClbPermissionProps = {
  members?: string[];
  groups?: string[];
  permission: PermissionValueType;
};

export type DeleteClbPermissionProps = RequireOnlyOne<{
  tmbId: string;
  groupId: string;
}>;

export type UpdatePermissionBody = {
  permission: PermissionValueType;
} & RequireOnlyOne<{
  memberId: string;
  groupId: string;
}>;
