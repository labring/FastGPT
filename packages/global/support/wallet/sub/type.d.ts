import type { StandardSubLevelEnum, SubModeEnum, SubTypeEnum } from './constants';

// Content of plan
export type TeamStandardSubPlanItemType = {
  name?: string;
  desc?: string; // Plan description
  price: number; // read price / month

  pointPrice: number; // read price/ one thousand

  totalPoints: number; // n
  maxTeamMember: number;
  maxAppAmount: number; // max app or plugin amount
  maxDatasetAmount: number;
  maxDatasetSize: number;

  requestsPerMinute?: number;
  appRegistrationCount?: number;
  chatHistoryStoreDuration: number; // n day
  websiteSyncPerDataset?: number;
  auditLogStoreDuration?: number;
  ticketResponseTime?: number;
  customDomain?: number;

  // Custom plan specific fields
  priceDescription?: string;
  customFormUrl?: string;
  customDescriptions?: string[];
};

export type StandSubPlanLevelMapType = Record<
  `${StandardSubLevelEnum}`,
  TeamStandardSubPlanItemType
>;

export type PointsPackageItem = {
  points: number;
  month: number;
  price: number;
};

export type SubPlanType = {
  [SubTypeEnum.standard]?: StandSubPlanLevelMapType;
  planDescriptionUrl?: string;
  appRegistrationUrl?: string;
  communitySupportTip?: string;
  [SubTypeEnum.extraDatasetSize]: {
    price: number;
  };
  [SubTypeEnum.extraPoints]: {
    packages: PointsPackageItem[];
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

  // custom level configurations
  requestsPerMinute?: number;
  chatHistoryStoreDuration?: number;
  maxDatasetSize?: number;
  websiteSyncPerDataset?: number;
  appRegistrationCount?: number;
  auditLogStoreDuration?: number;
  ticketResponseTime?: number;
  customDomain?: number;

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
  usedRegistrationCount: number;
};
