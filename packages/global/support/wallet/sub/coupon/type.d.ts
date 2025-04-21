import { SubTypeEnum, StandardSubLevelEnum } from '../type';

export type TeamCouponSub = {
  type: SubTypeEnum; // 套餐类型
  startTime: string; // 开始时间
  expiredTime: string; // 结束时间
  level?: StandardSubLevelEnum; // 套餐等级
  extraDatasetSize?: number; // 额外知识库容量
  totalPoints?: number; // 总积分
  surplusPoints?: number; // 剩余积分
};

export type TeamCouponSchema = {
  key: string;
  subscriptions: TeamCouponSub[];
  redeemedAt?: Date;
  expiredAt?: Date;
};
