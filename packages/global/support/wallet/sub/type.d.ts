import { SubModeEnum, SubStatusEnum, SubTypeEnum } from './constants';

export type TeamSubSchema = {
  teamId: string;
  type: `${SubTypeEnum}`;
  mode: `${SubModeEnum}`;
  status: `${SubStatusEnum}`;
  renew: boolean;
  startTime: Date;
  expiredTime: Date;
  datasetStoreAmount?: number;
};
