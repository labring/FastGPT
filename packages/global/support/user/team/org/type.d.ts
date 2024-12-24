import type { TeamPermission } from 'support/permission/user/controller';
import { ResourcePermissionType } from '../type';
import type { OrgMemberRole } from './constant';

type OrgSchemaType = {
  _id: string;
  teamId: string;
  path: string;
  name: string;
  avatar: string | undefined;
  description: string | undefined;
  updateTime: Date;
};

type OrgMemberSchemaType = {
  orgId: string;
  tmbId: string;
  role: `${OrgMemberRole}`;
};

type OrgType = OrgSchemaType & {
  members: OrgMemberSchemaType[];
  permission: TeamPermission | undefined;
};
