import type { SubTypeEnum, StandardSubLevelEnum } from '../constants';

export type TeamCouponSub = {
  type: `${SubTypeEnum}`; // Sub type
  durationDay: number; // Duration day
  level?: `${StandardSubLevelEnum}`; // Standard sub level
  extraDatasetSize?: number; // Extra dataset size
  totalPoints?: number; // Total points(Extrapoints or Standard sub)
};

export type TeamCouponSchema = {
  key: string;
  subscriptions: TeamCouponSub[];
  redeemedAt?: Date;
  expiredAt?: Date;
};
