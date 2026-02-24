import { TeamMemberItemType } from '../../user/team/type';
import { TeamPermission } from '../user/controller';
import type { GroupMemberRole } from './constant';
import type { Permission } from '../controller';

export type MemberGroupSchemaType = {
  _id: string;
  teamId: string;
  name: string;
  avatar: string;
  updateTime: Date;
};

export type GroupMemberSchemaType = {
  groupId: string;
  tmbId: string;
  role: `${GroupMemberRole}`;
};

export type MemberGroupListItemType<WithMembers extends boolean | undefined> =
  MemberGroupSchemaType & {
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

export type GroupMemberItemType = {
  tmbId: string;
  name: string;
  avatar: string;
  role: `${GroupMemberRole}`;
};
