import { StandardSubLevelEnum, SubModeEnum, SubStatusEnum, SubTypeEnum } from './constants';

// Content of plan
export type TeamStandardSubPlanItemType = {
  price: number; // read price
  pointPrice: number; // read price/ one ten thousand
  maxTeamMember: number;
  maxAppAmount: number; // max app or plugin amount
  maxDatasetAmount: number;
  chatHistoryStoreDuration: number; // n day
  maxDatasetSize: number;
  customApiKey: boolean;
  customCopyright: boolean; // feature
  websiteSyncInterval: number; // n hours
  trainingWeight: number; // 1~4
  reRankWeight: number; // 1~4
  totalPoints: number; // n ten thousand
};

export type StandSubPlanLevelMapType = Record<
  `${StandardSubLevelEnum}`,
  TeamStandardSubPlanItemType
>;

export type SubPlanType = {
  [SubTypeEnum.standard]: StandSubPlanLevelMapType;
  [SubTypeEnum.extraDatasetSize]: {
    price: number;
  };
};

export type TeamSubSchema = {
  _id: string;
  teamId: string;
  type: `${SubTypeEnum}`;
  status: `${SubStatusEnum}`;
  currentMode: `${SubModeEnum}`;
  nextMode: `${SubModeEnum}`;
  startTime: Date;
  expiredTime: Date;
  price: number;

  currentSubLevel: `${StandardSubLevelEnum}`;
  nextSubLevel: `${StandardSubLevelEnum}`;
  pointPrice: number;
  totalPoints: number;

  currentExtraDatasetSize: number;
  nextExtraDatasetSize: number;

  currentExtraPoints: number;
  nextExtraPoints: number;

  surplusPoints: number;

  // abandon
  datasetStoreAmount?: number;
  renew?: boolean;
};

export type FeTeamSubType = {
  [SubTypeEnum.standard]?: TeamSubSchema;
  [SubTypeEnum.extraDatasetSize]?: TeamSubSchema;
  [SubTypeEnum.extraPoints]?: TeamSubSchema;

  standardMaxDatasetSize: number;
  totalPoints: number;
  usedPoints: number;

  standardMaxPoints: number;
  datasetMaxSize: number;
  usedDatasetSize: number;
};
