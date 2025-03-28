import { TeamMemberItemType } from 'support/user/team/type';
import { TeamPermission } from '../user/controller';
import { GroupMemberRole } from './constant';
import { Permission } from '../controller';

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

type MemberGroupListItemType<T extends boolean | undefined> = MemberGroupSchemaType & {
  members: T extends true
    ? {
        tmbId: string;
        name: string;
        avatar: string;
      }[]
    : undefined;
  count: T extends true ? number : undefined;
  owner?: T extends true
    ? {
        tmbId: string;
        name: string;
        avatar: string;
      }
    : undefined;
  permission: T extends true ? Permission : undefined;
};

type GroupMemberItemType = {
  tmbId: string;
  name: string;
  avatar: string;
  role: `${GroupMemberRole}`;
};
