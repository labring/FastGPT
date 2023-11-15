import { TeamMemberRoleEnum } from './constant';
import { TeamMemberSchema } from './type';

export type AuthTeamRoleProps = {
  teamId: string;
  tmbId: string;
  role?: `${TeamMemberRoleEnum}`;
};
export type CreateTeamProps = {
  name: string;
  avatar?: string;
  defaultTeam?: boolean;
};
export type UpdateTeamProps = {
  teamId: string;
  name?: string;
  avatar?: string;
};

/* ------------- member ----------- */
export type DelMemberProps = {
  teamId: string;
  memberId: string;
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
  role: `${TeamMemberRoleEnum}`;
};
export type UpdateInviteProps = {
  tmbId: string;
  status: TeamMemberSchema['status'];
};
export type InviteMemberResponse = Record<
  'invite' | 'inValid' | 'inTeam',
  { username: string; userId: string }[]
>;
