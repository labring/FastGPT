import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import {
  CreateTeamProps,
  DelMemberProps,
  InviteMemberProps,
  InviteMemberResponse,
  UpdateInviteProps,
  UpdateTeamMemberProps,
  UpdateTeamProps
} from '@fastgpt/global/support/user/team/controller.d';
import {
  TeamItemType,
  TeamMemberItemType,
  TeamMemberSchema
} from '@fastgpt/global/support/user/team/type.d';

/* --------------- team  ---------------- */
export const getTeamList = (status: `${TeamMemberSchema['status']}`) =>
  GET<TeamItemType[]>(`/proApi/support/user/team/list`, { status });
export const postCreateTeam = (data: CreateTeamProps) =>
  POST<string>(`/proApi/support/user/team/create`, data);
export const putUpdateTeam = (data: UpdateTeamProps) =>
  PUT(`/proApi/support/user/team/update`, data);
export const putSwitchTeam = (teamId: string) =>
  PUT<string>(`/proApi/support/user/team/switch`, { teamId });

/* --------------- team member ---------------- */
export const getTeamMembers = (teamId: string) =>
  GET<TeamMemberItemType[]>(`/proApi/support/user/team/member/list`, { teamId });
export const postInviteTeamMember = (data: InviteMemberProps) =>
  POST<InviteMemberResponse>(`/proApi/support/user/team/member/invite`, data);
export const putUpdateMember = (data: UpdateTeamMemberProps) =>
  PUT(`/proApi/support/user/team/member/update`, data);
export const putUpdateMemberName = (name: string) =>
  PUT(`/proApi/support/user/team/member/updateName`, { name });
export const delRemoveMember = (props: DelMemberProps) =>
  DELETE(`/proApi/support/user/team/member/delete`, props);
export const updateInviteResult = (data: UpdateInviteProps) =>
  PUT('/proApi/support/user/team/member/updateInvite', data);
export const delLeaveTeam = (teamId: string) =>
  DELETE('/proApi/support/user/team/member/leave', { teamId });

/* team limit */
export const checkTeamExportDatasetLimit = (datasetId: string) =>
  GET(`/support/user/team/limit/exportDatasetLimit`, { datasetId });
export const checkTeamWebSyncLimit = () => GET(`/support/user/team/limit/webSyncLimit`);
export const checkTeamDatasetSizeLimit = (size: number) =>
  GET(`/support/user/team/limit/datasetSizeLimit`, { size });
