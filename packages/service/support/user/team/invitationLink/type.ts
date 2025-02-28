import { TeamMemberSchema } from '@fastgpt/global/support/user/team/type';

export type InvitationSchemaType = {
  _id: string;
  teamId: string;
  usedTimesLimit?: number;
  forbidden?: boolean;
  expires: Date;
  description: string;
};

export type InvitationType = Omit<InvitationSchemaType, 'members'> & {
  members: TeamMemberSchema[];
};

export type InvitationLinkCreateType = Omit<
  InvitationSchemaType,
  'members' | '_id' | 'teamId' | 'forbidden'
>;
export type InvitationLinkUpdateType = Partial<
  Omit<InvitationSchemaType, 'members' | 'teamId' | '_id'>
> & {
  _id: string;
};
