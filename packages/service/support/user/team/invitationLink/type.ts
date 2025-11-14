import { type TeamMemberSchema } from '@fastgpt/global/support/user/team/type';

export type InvitationSchemaType = {
  _id: string;
  linkId: string;
  teamId: string;
  usedTimesLimit?: number;
  forbidden?: boolean;
  expires: Date;
  description: string;
  members: string[];
};

export type InvitationType = Omit<InvitationSchemaType, 'members'> & {
  members: {
    tmbId: string;
    avatar: string;
    name: string;
  }[];
};

export type InvitationLinkExpiresType = '30m' | '7d' | '1y';

export type InvitationLinkCreateType = {
  description: string;
  expires: InvitationLinkExpiresType;
  usedTimesLimit: 1 | -1;
};

// export type InvitationLinkUpdateType = Partial<
//   Omit<InvitationSchemaType, 'members' | 'teamId' | '_id'>
// >;

export type InvitationInfoType = InvitationSchemaType & {
  teamAvatar: string;
  teamName: string;
};
