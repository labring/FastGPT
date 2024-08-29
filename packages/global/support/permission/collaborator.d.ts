import { RequireAtLeastOne, RequireOnlyOne } from 'common/type/utils';
import { Permission } from './controller';
import { PermissionValueType } from './type';

export type CollaboratorItemType = {
  teamId: string;
  tmbId: string;
  permission: Permission;
  name: string;
  avatar: string;
};

export type UpdateClbPermissionProps = RequireAtLeastOne<
  {
    members: string[];
    groups: string[];
    permission: PermissionValueType;
  },
  'members' | 'groups'
>;

export type DeleteClbPermissionProps = RequireOnlyOne<{
  tmbId: string;
  groupId: string;
}>;
