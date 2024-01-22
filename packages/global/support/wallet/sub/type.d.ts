import { StandardSubLevelEnum, SubModeEnum, SubStatusEnum, SubTypeEnum } from './constants';

export type TeamSubSchema = {
  _id: string;
  teamId: string;
  type: `${SubTypeEnum}`;
  status: `${SubStatusEnum}`;
  mode: `${SubModeEnum}`;
  startTime: Date;
  expiredTime: Date;
  price: number;

  currentSubLevel?: `${StandardSubLevelEnum}`;
  nextSubLevel?: `${StandardSubLevelEnum}`;

  currentExtraDatasetSize?: number;
  nextExtraDatasetSize?: number;

  currentExtraPoints?: number;
  nextExtraPoints?: number;

  maxTeamMember?: number;
  maxAppAmount?: number;
  maxDatasetAmount?: number;
  chatHistoryStoreDuration?: number;
  maxDatasetSize?: number;
  customApiKey?: boolean;
  customCopyright?: number;
  exportDatasetInterval?: number;
  websiteSyncInterval?: number;
  reRankWeight?: number;
  totalPoints?: number;

  surplusPoints?: number;

  // abandon
  datasetStoreAmount?: number;
  renew?: boolean;
};
