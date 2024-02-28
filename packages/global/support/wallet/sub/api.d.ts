import { StandardSubLevelEnum, SubModeEnum } from './constants';
import { TeamSubSchema } from './type.d';

export type StandardSubPlanParams = {
  level: `${StandardSubLevelEnum}`;
  mode: `${SubModeEnum}`;
};

export type StandardSubPlanUpdateResponse = {
  balanceEnough: boolean; // team balance is enough
  teamBalance: number;
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
