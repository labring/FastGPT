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
  orgId: string;
}>;

export type UpdateClbPermissionProps = {
  members?: string[];
  groups?: string[];
  orgs?: string[];
  permission: PermissionValueType;
};

export type DeletePermissionQuery = RequireOnlyOne<{
  tmbId?: string;
  groupId?: string;
  orgId?: string;
}>;
