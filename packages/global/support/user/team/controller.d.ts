import { TeamMemberRoleEnum } from './constant';

export type AuthTeamRoleProps = { userId: string; teamId: string; role?: `${TeamMemberRoleEnum}` };
export type CreateTeamProps = {
  name: string;
  avatar?: string;
};
export type UpdateTeamProps = {
  id: string;
  name?: string;
  avatar?: string;
};

export type CreateTeamMemberProps = {
  ownerId: string;
  teamId: string;
  userId: string;
  name?: string;
};
export type UpdateTeamMemberProps = {
  id: string;
  name?: string;
};
