import { GET, POST } from '@/web/admin/common/request';
import { GET as appGET, PUT as appPUT } from '@/web/common/api/request';
import type {
  AdminSwitchTeamBodyType,
  AdminSwitchTeamResponseType,
  AdminTeamSelectorQueryType,
  AdminTeamSelectorResponseType,
  GetTeamMembersResponseType,
  GetTeamsBodyType,
  GetTeamsResponseType
} from '@fastgpt/global/openapi/admin/team/api';

export const getTeams = (data: GetTeamsBodyType) =>
  POST<GetTeamsResponseType>('/proApi/admin/team/getTeams', data, { maxQuantity: 1 });

export const getTeamMembers = (teamId: string) =>
  GET<GetTeamMembersResponseType>('/proApi/admin/team/getTeamMembers', { teamId });

export const putAdminSwitchTeam = (data: AdminSwitchTeamBodyType) =>
  appPUT<AdminSwitchTeamResponseType>('/admin/team/switch', data);

export const getAdminTeamSelectorList = (
  params?: AdminTeamSelectorQueryType,
  cancelToken?: AbortController
) => appGET<AdminTeamSelectorResponseType>('/admin/team/list', params, { cancelToken });
