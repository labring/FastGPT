import { POST } from '@/web/admin/common/request';
import type { GetTeamsResponseType } from '@fastgpt/global/openapi/admin/routes/teams/api';
import type { GetUsersResponseType } from '@fastgpt/global/openapi/admin/routes/users/api';
import type { PaginationResponse } from '@fastgpt/global/openapi/api';
import type {
  StandardSubLevelEnum,
  SubTypeEnum
} from '@fastgpt/global/support/wallet/sub/constants';

/** 套餐列表项（原 pro/admin pages/users/plans 的 PlanType 内联） */
export type AdminPlanType = {
  id: string;
  teamId: string;
  teamName: string;
  userName: string;
  type: `${SubTypeEnum}`;
  level: `${StandardSubLevelEnum}`;
  createTime: string;
  expiredTime: string;
  startTime: string;
  totalPoints: number;
  surplusPoints: number;
  extraDatasetSize: number;
  maxTeamMember?: number;
  maxApp?: number;
  maxDataset?: number;
  maxDatasetSize?: number;
  requestsPerMinute?: number;
  websiteSyncPerDataset?: number;
  chatHistoryStoreDuration?: number;
  appRegistrationCount?: number;
  auditLogStoreDuration?: number;
  ticketResponseTime?: number;
  customDomain?: number;
  maxUploadFileSize?: number;
  maxUploadFileCount?: number;
  enableSandbox?: boolean;
};

export const getUsers = (data: any) =>
  POST<GetUsersResponseType>('/proApi/admin/routes/users/getUsers', data, { maxQuantity: 1 });

export const getTeams = (data: any) =>
  POST<GetTeamsResponseType>('/proApi/admin/routes/teams/getTeams', data, { maxQuantity: 1 });

export const getPlans = (data: any) =>
  POST<PaginationResponse<AdminPlanType>>('/proApi/admin/routes/plans/getPlans', data, {
    maxQuantity: 1
  });
