import { TeamMemberItemType } from 'support/user/team/type';
import { TeamPermission } from '../user/controller';
import { GroupMemberRole } from './constant';

type MemberGroupSchemaType = {
  _id: string;
  teamId: string;
  name: string;
  avatar: string;
  updateTime: Date;
};

type GroupMemberSchemaType = {
  groupId: string;
  tmbId: string;
  role: `${GroupMemberRole}`;
};

type MemberGroupType = MemberGroupSchemaType & {
  members: {
    tmbId: string;
    role: `${GroupMemberRole}`;
  }[]; // we can get tmb's info from other api. there is no need but only need to get tmb's id
  permission: TeamPermission;
};

type MemberGroupListType = MemberGroupType[];
