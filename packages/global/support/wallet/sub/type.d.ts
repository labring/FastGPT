import { StandardSubLevelEnum, SubModeEnum, SubTypeEnum } from './constants';

// Content of plan
export type TeamStandardSubPlanItemType = {
  name?: string;
  price: number; // read price / month
  pointPrice: number; // read price/ one thousand
  totalPoints: number; // n
  maxTeamMember: number;
  maxAppAmount: number; // max app or plugin amount
  maxDatasetAmount: number;
  chatHistoryStoreDuration: number; // n day
  maxDatasetSize: number;
  trainingWeight: number; // 1~4
  permissionCustomApiKey: boolean;
  permissionCustomCopyright: boolean; // feature
  permissionWebsiteSync: boolean;
  permissionReRank: boolean;
};

export type StandSubPlanLevelMapType = Record<
  `${StandardSubLevelEnum}`,
  TeamStandardSubPlanItemType
>;

export type SubPlanType = {
  [SubTypeEnum.standard]: StandSubPlanLevelMapType;
  planDescriptionUrl?: string;
  [SubTypeEnum.extraDatasetSize]: {
    price: number;
  };
  [SubTypeEnum.extraPoints]: {
    price: number;
  };
};

export type TeamSubSchema = {
  _id: string;
  teamId: string;
  type: `${SubTypeEnum}`;
  startTime: Date;
  expiredTime: Date;

  currentMode: `${SubModeEnum}`;
  nextMode: `${SubModeEnum}`;
  currentSubLevel: StandardSubLevelEnum;
  nextSubLevel: StandardSubLevelEnum;

  totalPoints: number;
  surplusPoints: number;

  currentExtraDatasetSize: number;
};

export type TeamCouponSub = {
  type: SubTypeEnum; // 套餐类型
  startTime: string; // 开始时间
  expiredTime: string; // 结束时间
  price: number; // 价格
  level: StandardSubLevelEnum; // 套餐等级
  extraDatasetSize: number; // 额外知识库容量
  totalPoints: number; // 总积分
  surplusPoints: number; // 剩余积分
};

export type TeamCouponSchema = {
  teamId: string;
  key: string;
  subscriptions: TeamCouponSub[];
  redeemedAt?: Date;
  expiredAt?: Date;
};

export type FeTeamPlanStatusType = {
  [SubTypeEnum.standard]?: TeamSubSchema;
  standardConstants?: TeamStandardSubPlanItemType;

  totalPoints: number;
  usedPoints: number;

  // standard + extra
  datasetMaxSize: number;
  usedDatasetSize: number;
};
