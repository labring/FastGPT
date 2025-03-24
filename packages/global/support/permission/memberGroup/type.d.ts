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
    name: string;
    avatar: string;
  }[];
  count: number;
  owner: {
    tmbId: string;
    name: string;
    avatar: string;
  };
  canEdit: boolean;
};

type MemberGroupListType = MemberGroupType[];

type GroupMemberItemType = {
  tmbId: string;
  name: string;
  avatar: string;
  role: `${GroupMemberRole}`;
};
