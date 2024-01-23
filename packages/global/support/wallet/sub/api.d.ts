import { SubModeEnum } from './constants';

export type SubDatasetSizeParams = {
  size: number;
};
export type SubDatasetSizePreviewCheckResponse = {
  payForNewSub: boolean; // Does this change require payment
  newSubSize: number; // new sub dataset size
  alreadySubSize: number; // old sub dataset size
  payPrice: number; // this change require payment
  newPrice: number; // the new sub price
  newSubStartTime: Date;
  newSubExpiredTime: Date;
  balanceEnough: boolean; // team balance is enough
};
