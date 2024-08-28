import { TeamMemberItemType } from 'support/user/team/type';

type MemberGroupSchemaType = {
  _id: string;
  teamId: string;
  name: string;
  avatar: string;
};

type GroupMemberSchemaType = {
  groupId: string;
  tmbId: string;
};

type MemberGroupType = MemberGroupSchemaType & {
  members: string[]; // we can get tmb's info from other api. there is no need but only need to get tmb's id
};

type MemberGroupListType = MemberGroupType[];
