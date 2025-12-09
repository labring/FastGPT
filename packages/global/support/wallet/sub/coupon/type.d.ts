import type { SubTypeEnum, StandardSubLevelEnum } from '../constants';
import type { CouponTypeEnum } from './constants';

export type CustomSubConfig = {
  requestsPerMinute: number;
  maxTeamMember: number;
  maxAppAmount: number;
  maxDatasetAmount: number;
  chatHistoryStoreDuration: number;
  maxDatasetSize: number;
  websiteSyncPerDataset: number;
  appRegistrationCount: number;
  auditLogStoreDuration: number;
  ticketResponseTime: number;
  customDomain: number;
};

export type TeamCouponSub = {
  type: `${SubTypeEnum}`; // Sub type
  durationDay: number; // Duration day
  level?: `${StandardSubLevelEnum}`; // Standard sub level
  extraDatasetSize?: number; // Extra dataset size
  totalPoints?: number; // Total points(Extrapoints or Standard sub)
  customConfig?: CustomSubConfig; // Custom config for custom level (only required when level=custom)
};

export type TeamCouponSchema = {
  key: string;
  subscriptions: TeamCouponSub[];
  redeemedAt?: Date;
  expiredAt?: Date;
  redeemedTeamId?: string;
  type: CouponTypeEnum;
  price?: number;
  description?: string;
};
