import { GET, POST } from '@/web/admin/common/request';
import type {
  GetTeamMembersResponseType,
  GetTeamsResponseType
} from '@fastgpt/global/openapi/admin/team/api';
import type { PaginationProps } from '@fastgpt/global/openapi/api';

export type AdminUpdateTeamData = {
  id: string;
  name?: string;
  balance?: number;
};

export const getTeams = (data: PaginationProps<{ search?: string }>) =>
  POST<GetTeamsResponseType>('/proApi/admin/team/getTeams', data, { maxQuantity: 1 });

export const getTeamMembers = (teamId: string) =>
  GET<GetTeamMembersResponseType>('/proApi/admin/team/getTeamMembers', { teamId });

export const updateTeam = (data: AdminUpdateTeamData) =>
  POST('/proApi/admin/team/updateTeam', data);
