import { GET, POST, PUT } from '@/web/common/api/request';
import { CreateTeamProps, UpdateTeamProps } from '@fastgpt/global/support/user/team/controller.d';
import { TeamItemType } from '@fastgpt/global/support/user/team/type.d';

export const getTeamList = () => POST<TeamItemType[]>(`/plusApi/support/user/team/list`);
export const postCreateTeam = (data: CreateTeamProps) =>
  POST<string>(`/plusApi/support/user/team/create`, data);
export const putUpdateTeam = (data: UpdateTeamProps) =>
  PUT(`/plusApi/support/user/team/update`, data);
export const deleteTeam = (id: number) => GET(`/plusApi/support/user/team/delete`, { id });
export const putSwitchTeam = (teamId: string) =>
  PUT<string>(`/plusApi/support/user/team/switch`, { teamId });
