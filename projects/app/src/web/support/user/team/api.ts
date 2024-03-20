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
import type { TeamTagItemType, TeamTagSchema } from '@fastgpt/global/support/user/team/type';
import {
  TeamItemType,
  TeamMemberItemType,
  TeamMemberSchema
} from '@fastgpt/global/support/user/team/type.d';
import { FeTeamPlanStatusType, TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type';

/* --------------- team  ---------------- */
export const getTeamList = (status: `${TeamMemberSchema['status']}`) =>
  GET<TeamItemType[]>(`/support/user/team/list`, { status });
export const postCreateTeam = (data: CreateTeamProps) =>
  POST<string>(`/support/user/team/create`, data);
export const putUpdateTeam = (data: UpdateTeamProps) => PUT(`/support/user/team/update`, data);
export const putSwitchTeam = (teamId: string) =>
  PUT<string>(`/support/user/team/switch`, { teamId });

/* --------------- team member ---------------- */
export const getTeamMembers = (teamId: string) =>
  GET<TeamMemberItemType[]>(`/support/user/team/member/list`, { teamId });
export const postInviteTeamMember = (data: InviteMemberProps) =>
  POST<InviteMemberResponse>(`/support/user/team/member/invite`, data);
export const putUpdateMember = (data: UpdateTeamMemberProps) =>
  PUT(`/support/user/team/member/update`, data);
export const putUpdateMemberName = (name: string) =>
  PUT(`/support/user/team/member/updateName`, { name });
export const delRemoveMember = (props: DelMemberProps) =>
  DELETE(`/support/user/team/member/delete`, props);
export const updateInviteResult = (data: UpdateInviteProps) =>
  PUT('/plusApi/support/user/team/member/updateInvite', data);
export const delLeaveTeam = (teamId: string) =>
  DELETE('/support/user/team/member/leave', { teamId });

/* --------------- team tags ---------------- */
export const getTeamsTags = () => GET<TeamTagSchema[]>(`/proApi/support/user/team/tag/list`);
export const loadTeamTagsByDomain = (domain: string) =>
  GET<TeamTagItemType[]>(`/proApi/support/user/team/tag/async`, { domain });

/* team limit */
export const checkTeamExportDatasetLimit = (datasetId: string) =>
  GET(`/support/user/team/limit/exportDatasetLimit`, { datasetId });
export const checkTeamWebSyncLimit = () => GET(`/support/user/team/limit/webSyncLimit`);
export const checkTeamDatasetSizeLimit = (size: number) =>
  GET(`/support/user/team/limit/datasetSizeLimit`, { size });

/* plans */
export const getTeamPlanStatus = () =>
  GET<FeTeamPlanStatusType>(`/support/user/team/plan/getTeamPlanStatus`, { maxQuantity: 1 });
export const getTeamPlans = () => GET<TeamSubSchema[]>(`/support/user/team/plan/getTeamPlans`);
