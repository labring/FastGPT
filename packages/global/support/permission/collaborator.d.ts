import type { RequireOnlyOne } from '../../common/type/utils';
import { RequireAtLeastOne } from '../../common/type/utils';
import type { Permission } from './controller';
import type { PermissionValueType } from './type';

export type CollaboratorItemType = {
  teamId: string;
  permission: Permission;
  selfPermission?: Permission;
  name: string;
  avatar: string;
} & RequireOnlyOne<{
  tmbId: string;
  groupId: string;
  orgId: string;
}>;

export type UpdateClbPermissionProps<addOnly = false> = {
  members?: string[];
  groups?: string[];
  orgs?: string[];
} & (addOnly extends true
  ? {}
  : {
      permission: PermissionValueType;
    });

export type DeletePermissionQuery = RequireOnlyOne<{
  tmbId?: string;
  groupId?: string;
  orgId?: string;
}>;
