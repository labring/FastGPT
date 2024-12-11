import { OrgMemberRole } from './constant';
import { ResourcePermissionType } from '../type';
import { TeamPermission } from 'support/permission/user/controller';

type OrgSchemaType = {
  _id: string;
  teamId: string;
  path: string;
  name: string;
  avatar: string;
  updateTime: Date;
};

type OrgMemberSchemaType = {
  orgId: string | undefined;
  tmbId: string;
  role: `${OrgMemberRole}`;
};

type OrgType = OrgSchemaType & {
  members: OrgMemberSchemaType[] | undefined;
  permission: TeamPermission | undefined;
};
