import type { SubTypeEnum, StandardSubLevelEnum } from '../constants';
import type {
  CouponTypeEnum,
  DiscountCouponSceneEnum,
  DiscountCouponStatusEnum
} from './constants';

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

export type DiscountCouponSchemaType = {
  _id: string;
  teamId: string;
  name: string;
  discount: number;
  scenes: DiscountCouponSceneEnum[];
  status: DiscountCouponStatusEnum;
  startTime: Date;
  expiredTime: Date;
  usedTime?: Date;
  billId?: string; // 关联的账单ID
  createTime: Date;
  type: BillTypeEnum[]; // 优惠券类型
  level?: `${StandardSubLevelEnum}`[];
};

export type CreateDiscountCouponParams = {
  teamId: string;
  name: string;
  discount: number;
  scenes: DiscountCouponSceneEnum[];
  type: BillTypeEnum[];
  level?: `${StandardSubLevelEnum}`[];
  startTime?: Date;
  expiredTime?: Date;
};
