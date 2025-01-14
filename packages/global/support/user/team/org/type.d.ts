import type { TeamPermission } from 'support/permission/user/controller';
import { ResourcePermissionType } from '../type';

type OrgSchemaType = {
  _id: string;
  teamId: string;
  pathId: string;
  path: string;
  name: string;
  avatar?: string;
  description?: string;
  updateTime: Date;
};

type OrgMemberSchemaType = {
  _id: string;
  teamId: string;
  orgId: string;
  tmbId: string;
};

type OrgType = Omit<OrgSchemaType, 'avatar'> & {
  avatar: string;
  permission: TeamPermission;
  members: OrgMemberSchemaType[];
};
