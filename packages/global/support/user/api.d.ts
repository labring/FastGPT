import { MemberGroupSchemaType, MemberGroupType } from 'support/permission/memberGroup/type';
import { OAuthEnum } from './constant';
import { TrackRegisterParams } from './login/api';
import { TeamMemberStatusEnum } from './team/constant';
import { OrgType } from './team/org/type';
import { TeamMemberItemType } from './team/type';

export type PostLoginProps = {
  username: string;
  password: string;
};

export type OauthLoginProps = {
  type: `${OAuthEnum}`;
  code: string;
  callbackUrl: string;
} & TrackRegisterParams;

export type WxLoginProps = {
  inviterId?: string;
  code: string;
};

export type FastLoginProps = {
  token: string;
  code: string;
};

export type SearchResult = {
  members: Omit<TeamMemberItemType, 'teamId' | 'permission'>[];
  orgs: Omit<OrgType, 'permission' | 'members'>[];
  groups: MemberGroupSchemaType[];
};
