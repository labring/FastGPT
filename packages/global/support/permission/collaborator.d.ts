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

export type DeleteClbPermissionProps = RequireOnlyOne<{
  tmbId: string;
  groupId: string;
  orgId: string;
}>;

export type UpdatePermissionBody = {
  permission: PermissionValueType;
} & RequireOnlyOne<{
  memberId: string;
  groupId: string;
  orgId: string;
}>;

export type CreatePermissionBody = {
  tmbId: string[];
  groupId: string[];
  orgId: string[];
};

export type DeletePermissionQuery = RequireOnlyOne<{
  tmbId?: string;
  groupId?: string;
  orgId?: string;
}>;

export type TeamClbsListType = {
  permission: number;
  name: string;
  avatar: string;
};

export type ListPermissionResponse = {
  tmb: (TeamClbsListType & { tmbId: string })[];
  group: (TeamClbsListType & { groupId: string })[];
  org: (TeamClbsListType & { orgId: string })[];
};
