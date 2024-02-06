import { StandardSubLevelEnum, SubModeEnum } from './constants';
import { TeamSubSchema } from './type.d';

export type SubDatasetSizeParams = {
  size: number;
};
export type StandardSubPlanParams = {
  level: `${StandardSubLevelEnum}`;
  mode: `${SubModeEnum}`;
};

export type SubDatasetSizePreviewCheckResponse = {
  payForNewSub: boolean; // Does this change require payment
  newSubSize: number; // new sub dataset size
  alreadySubSize: number; // old sub dataset size
  payPrice: number; // this change require payment
  newPlanPrice: number; // the new sub price
  newSubStartTime: Date;
  newSubExpiredTime: Date;
  balanceEnough: boolean; // team balance is enough
};
export type StandardSubPlanUpdateResponse = {
  balanceEnough: boolean; // team balance is enough
  payPrice?: number;
  planPrice: number;
  planPointPrice: number;

  currentMode: `${SubModeEnum}`;
  nextMode: `${SubModeEnum}`;
  currentSubLevel: `${StandardSubLevelEnum}`;
  nextSubLevel: `${StandardSubLevelEnum}`;
  totalPoints: number;
  surplusPoints: number;
  planStartTime: Date;
  planExpiredTime: Date;
};
