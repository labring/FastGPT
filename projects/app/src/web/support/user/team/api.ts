import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import { CreateTeamProps, UpdateTeamProps } from '@fastgpt/global/support/user/team/controller.d';
import { TeamItemType, TeamMemberItemType } from '@fastgpt/global/support/user/team/type.d';

/* --------------- team  ---------------- */
export const getTeamList = () => GET<TeamItemType[]>(`/plusApi/support/user/team/list`);
export const postCreateTeam = (data: CreateTeamProps) =>
  POST<string>(`/plusApi/support/user/team/create`, data);
export const putUpdateTeam = (data: UpdateTeamProps) =>
  PUT(`/plusApi/support/user/team/update`, data);
export const deleteTeam = (id: number) => DELETE(`/plusApi/support/user/team/delete`, { id });
export const putSwitchTeam = (tmbId: string) =>
  PUT<string>(`/plusApi/support/user/team/switch`, { tmbId });

/* --------------- team member ---------------- */
export const getTeamMembers = (teamId: string) =>
  GET<TeamMemberItemType[]>(`/plusApi/support/user/team/member/list`, { teamId });
