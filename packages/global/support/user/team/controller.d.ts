import { PermissionValueType } from '../../permission/type';
import { TeamMemberRoleEnum } from './constant';
import { LafAccountType, TeamMemberSchema } from './type';

export type AuthTeamRoleProps = {
  teamId: string;
  tmbId: string;
  role?: `${TeamMemberRoleEnum}`;
};
export type CreateTeamProps = {
  name: string;
  avatar?: string;
  defaultTeam?: boolean;
  lafAccount?: LafAccountType;
};
export type UpdateTeamProps = {
  name?: string;
  avatar?: string;
  teamDomain?: string;
  lafAccount?: null | LafAccountType;
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
