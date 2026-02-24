import type { TeamPermission } from '../../../permission/user/controller';
import { ResourcePermissionType } from '../type';
import { SourceMemberType } from '../../type';

type OrgSchemaType = {
  _id: string;
  teamId: string;
  pathId: string;
  path: string;
  name: string;
  avatar: string;
  description?: string;
  updateTime: Date;
};

type OrgMemberSchemaType = {
  _id: string;
  teamId: string;
  orgId: string;
  tmbId: string;
};

export type OrgListItemType = OrgSchemaType & {
  permission?: TeamPermission;
  total: number; // members + children orgs
};

export type OrgType = Omit<OrgSchemaType, 'avatar'> & {
  avatar: string;
  permission: TeamPermission;
  members: OrgMemberSchemaType[];
  total: number; // members + children orgs
};
