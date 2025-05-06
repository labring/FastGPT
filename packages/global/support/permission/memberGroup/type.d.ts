import { TeamMemberItemType } from 'support/user/team/type';
import { TeamPermission } from '../user/controller';
import type { GroupMemberRole } from './constant';
import type { Permission } from '../controller';

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

type MemberGroupListItemType<WithMembers extends boolean | undefined> = MemberGroupSchemaType & {
  members: WithMembers extends true
    ? {
        tmbId: string;
        name: string;
        avatar: string;
      }[]
    : undefined;
  count: WithMembers extends true ? number : undefined;
  owner?: WithMembers extends true
    ? {
        tmbId: string;
        name: string;
        avatar: string;
      }
    : undefined;
  permission: WithMembers extends true ? Permission : undefined;
};

type GroupMemberItemType = {
  tmbId: string;
  name: string;
  avatar: string;
  role: `${GroupMemberRole}`;
};
