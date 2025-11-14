import type { StandardSubLevelEnum, SubModeEnum, SubTypeEnum } from './constants';

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
  permissionTeamOperationLog: boolean;
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
  maxTeamMember?: number;
  maxApp?: number;
  maxDataset?: number;

  totalPoints: number;
  surplusPoints: number;

  currentExtraDatasetSize: number;
};

export type TeamPlanStatusType = {
  [SubTypeEnum.standard]?: TeamSubSchema;
  standardConstants?: TeamStandardSubPlanItemType;

  totalPoints: number;
  usedPoints: number;

  // standard + extra
  datasetMaxSize: number;
};

export type ClientTeamPlanStatusType = TeamPlanStatusType & {
  usedMember: number;
  usedAppAmount: number;
  usedDatasetSize: number;
  usedDatasetIndexSize: number;
};
