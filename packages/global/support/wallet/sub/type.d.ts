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
  websiteSyncInterval: boolean;
  reRankWeight: boolean; // 1~4
  trainingWeight: number; // 1~4
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
  [SubTypeEnum.extraPoints]: {
    price: number;
  };
};

export type TeamSubSchema = {
  _id: string;
  teamId: string;
  type: `${SubTypeEnum}`;
  status: `${SubStatusEnum}`;
  startTime: Date;
  expiredTime: Date;
  price: number;

  currentMode: `${SubModeEnum}`;
  nextMode: `${SubModeEnum}`;
  currentSubLevel: `${StandardSubLevelEnum}`;
  nextSubLevel: `${StandardSubLevelEnum}`;

  pointPrice: number;
  totalPoints: number;
  surplusPoints: number;

  currentExtraDatasetSize: number;
};

export type FeTeamSubType = {
  [SubTypeEnum.standard]?: TeamSubSchema;
  totalPoints: number;
  usedPoints: number;
  standardMaxDatasetSize?: number,
  standardMaxPoints?: number,

  // standard + extra
  datasetMaxSize: number;
  usedDatasetSize: number;
};
