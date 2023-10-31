import { TeamMemberRoleEnum } from './constant';

export type AuthTeamRoleProps = {
  userId: string;
  tmbId: string;
  role?: `${TeamMemberRoleEnum}`;
};
export type CreateTeamProps = {
  name: string;
  avatar?: string;
};
export type UpdateTeamProps = {
  teamId: string;
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
