import { OrgMemberRole } from './constant';
import { ResourcePermissionType } from '../type';
import { TeamPermission } from 'support/permission/user/controller';

type OrgSchemaType = {
  _id: string;
  teamId: string;
  path: string;
  name: string;
  avatar: string;
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
