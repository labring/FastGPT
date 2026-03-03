import type { MemberGroupSchemaType } from '../permission/memberGroup/type';
import { MemberGroupListItemType } from '../permission/memberGroup/type';
import type { OAuthEnum } from './constant';
import type { TeamMemberStatusEnum } from './team/constant';
import type { OrgType } from './team/org/type';
import type { TeamMemberItemType } from './team/type';
import type { LangEnum } from '../../common/i18n/type';
import type { TrackRegisterParams } from '../marketing/type';

export type PostLoginProps = {
  username: string;
  password: string;
  code: string;
  language?: `${LangEnum}`;
};

export type OauthLoginProps = {
  type: `${OAuthEnum}`;
  callbackUrl: string;
  props: Record<string, string>;
  language?: `${LangEnum}`;
} & TrackRegisterParams;

export type WxLoginProps = {
  inviterId?: string;
  code: string;
  bd_vid?: string;
  msclkid?: string;
  fastgpt_sem?: string;
  sourceDomain?: string;
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

export type PostAdminGenerateTokenProps = {
  username?: string;
  teamId?: string;
  tmbId?: string;
};

export type AdminGenerateTokenResponse = {
  token: string;
  userId: string;
  username: string;
  teamId: string;
  tmbId: string;
  teamName: string;
  teamAvatar?: string;
  memberName: string;
  avatar: string;
  role: string;
  status: `${TeamMemberStatusEnum}`;
  permission: {
    hasManagePer: boolean;
    hasWritePer: boolean;
    isOwner: boolean;
    hasAppCreatePer: boolean;
    hasDatasetCreatePer: boolean;
    hasApikeyCreatePer: boolean;
  };
  balance?: number;
};

export type AdminUserTeamsResponse = {
  userId: string;
  username: string;
  teams: {
    tmbId: string;
    teamId: string;
    teamName: string;
    teamAvatar: string;
    memberName: string;
    memberAvatar: string;
    role: string;
    status: `${TeamMemberStatusEnum}`;
    createTime: Date;
    balance: number;
  }[];
  totalCount: number;
  activeCount: number;
};
