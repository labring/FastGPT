import { PermissionValueType } from '../../permission/type';
import type { TeamMemberRoleEnum } from './constant';
import type { TeamMemberSchema, ThirdPartyAccountType } from './type';
import { LafAccountType } from './type';

export type AuthTeamRoleProps = {
  teamId: string;
  tmbId: string;
  role?: `${TeamMemberRoleEnum}`;
};
export type CreateTeamProps = {
  name: string;
  avatar?: string;
  memberName?: string;
  memberAvatar?: string;
  notificationAccount?: string;
};
export type UpdateTeamProps = Omit<ThirdPartyAccountType, 'externalWorkflowVariable'> & {
  name?: string;
  avatar?: string;
  teamDomain?: string;
  externalWorkflowVariable?: { key: string; value: string };
};

/* ------------- member ----------- */
export type DelMemberProps = {
  tmbId: string;
};
export type UpdateTeamMemberProps = {
  teamId: string;
  memberId: string;
  role?: TeamMemberSchema['role'];
  status?: TeamMemberSchema['status'];
};
export type InviteMemberProps = {
  teamId: string;
  usernames: string[];
};
export type UpdateInviteProps = {
  tmbId: string;
  status: TeamMemberSchema['status'];
};

export type InviteMemberResponse = Record<
  'invite' | 'inValid' | 'inTeam',
  { username: string; userId: string }[]
>;
