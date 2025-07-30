import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type {
  CollaboratorItemType,
  DeletePermissionQuery,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';
import type {
  CreateTeamProps,
  UpdateInviteProps,
  UpdateTeamProps
} from '@fastgpt/global/support/user/team/controller.d';
import type { TeamTagItemType, TeamTagSchema } from '@fastgpt/global/support/user/team/type';
import type {
  TeamTmbItemType,
  TeamMemberItemType,
  TeamMemberSchema
} from '@fastgpt/global/support/user/team/type.d';
import type {
  ClientTeamPlanStatusType,
  TeamSubSchema
} from '@fastgpt/global/support/wallet/sub/type';
import type { TeamInvoiceHeaderType } from '@fastgpt/global/support/user/team/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type {
  InvitationInfoType,
  InvitationLinkCreateType,
  InvitationType
} from '@fastgpt/service/support/user/team/invitationLink/type';

/* --------------- team  ---------------- */
export const getTeamList = (status: `${TeamMemberSchema['status']}`) =>
  GET<TeamTmbItemType[]>(`/proApi/support/user/team/list`, { status });
export const postCreateTeam = (data: CreateTeamProps) =>
  POST<string>(`/proApi/support/user/team/create`, data);
export const putUpdateTeam = (data: UpdateTeamProps) => PUT(`/support/user/team/update`, data);
export const putSwitchTeam = (teamId: string) =>
  PUT<string>(`/proApi/support/user/team/switch`, { teamId });

/* --------------- team member ---------------- */
export const getTeamMembers = (
  props: PaginationProps<{
    status?: 'active' | 'inactive';
    withOrgs?: boolean;
    withPermission?: boolean;
    searchKey?: string;
    orgId?: string;
    groupId?: string;
  }>
) => POST<PaginationResponse<TeamMemberItemType>>(`/proApi/support/user/team/member/list`, props);
export const getTeamMemberCount = () =>
  GET<{ count: number }>(`/proApi/support/user/team/member/count`);

// export const postInviteTeamMember = (data: InviteMemberProps) =>
//   POST<InviteMemberResponse>(`/proApi/support/user/team/member/invite`, data);
export const putUpdateMemberNameByManager = (tmbId: string, name: string) =>
  PUT(`/proApi/support/user/team/member/updateNameByManager`, { tmbId, name });

export const putUpdateMemberName = (name: string) =>
  PUT(`/proApi/support/user/team/member/updateName`, { name });
export const delRemoveMember = (tmbId: string) =>
  DELETE(`/proApi/support/user/team/member/delete`, { tmbId });
export const updateInviteResult = (data: UpdateInviteProps) =>
  PUT('/proApi/support/user/team/member/updateInvite', data);
export const postRestoreMember = (tmbId: string) =>
  POST('/proApi/support/user/team/member/restore', { tmbId });
export const delLeaveTeam = () => DELETE('/proApi/support/user/team/member/leave');

/* -------------- team invitaionlink -------------------- */

export const postCreateInvitationLink = (data: InvitationLinkCreateType) =>
  POST<string>(`/proApi/support/user/team/invitationLink/create`, data);

export const getInvitationLinkList = () =>
  GET<InvitationType[]>(`/proApi/support/user/team/invitationLink/list`);

export const postAcceptInvitationLink = (linkId: string) =>
  POST<string>(`/proApi/support/user/team/invitationLink/accept`, { linkId });

export const getInvitationInfo = (linkId: string) =>
  GET<InvitationInfoType>(`/proApi/support/user/team/invitationLink/info`, { linkId });
export const putForbidInvitationLink = (linkId: string) =>
  PUT<string>(`/proApi/support/user/team/invitationLink/forbid`, { linkId });

/* -------------- team collaborator -------------------- */
export const getTeamClbs = () =>
  GET<CollaboratorItemType[]>(`/proApi/support/user/team/collaborator/list`);
export const updateMemberPermission = (data: UpdateClbPermissionProps) =>
  PUT('/proApi/support/user/team/collaborator/update', data);
export const deleteMemberPermission = (id: DeletePermissionQuery) =>
  DELETE('/proApi/support/user/team/collaborator/delete', id);

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
  GET<ClientTeamPlanStatusType>(`/support/user/team/plan/getTeamPlanStatus`, { maxQuantity: 1 });
export const getTeamPlans = () =>
  GET<TeamSubSchema[]>(`/proApi/support/user/team/plan/getTeamPlans`);

export const redeemCoupon = (couponCode: string) =>
  GET(`/proApi/support/wallet/coupon/redeem`, { key: couponCode });

export const getTeamInvoiceHeader = () =>
  GET<TeamInvoiceHeaderType>(`/proApi/support/user/team/invoiceAccount/getTeamInvoiceHeader`);

export const updateTeamInvoiceHeader = (data: TeamInvoiceHeaderType) =>
  POST(`/proApi/support/user/team/invoiceAccount/update`, data);
