import { POST } from '@/web/admin/common/request';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';
import type {
  StandardSubLevelEnum,
  SubTypeEnum
} from '@fastgpt/global/support/wallet/sub/constants';

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

export type AdminAddPlanData = {
  teamId: string;
  type: SubTypeEnum;
  startTime: string;
  expiredTime: string;
  price: number;
  level: StandardSubLevelEnum;
  extraDatasetSize: number;
  totalPoints: number;
  surplusPoints: number;
};

export type AdminUpdatePlanData = Partial<AdminPlanType> & {
  id: string;
  price: number;
};

export const getPlans = (data: PaginationProps<{ search?: string }>) =>
  POST<PaginationResponse<AdminPlanType>>('/proApi/admin/wallet/plan/getPlans', data, {
    maxQuantity: 1
  });

export const addPlan = (data: AdminAddPlanData) => POST('/proApi/admin/wallet/plan/addPlans', data);

export const updatePlan = (data: AdminUpdatePlanData) =>
  POST('/proApi/admin/wallet/plan/updatePlan', data);
