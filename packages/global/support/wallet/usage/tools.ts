/* bill common  */
import { PRICE_SCALE } from '../constants';
import { UsageSourceEnum } from './constants';
import { AuthUserTypeEnum } from '../../permission/constant';

/**
 * dataset price / PRICE_SCALE = real price
 */
export const formatStorePrice2Read = (val = 0, multiple = 1) => {
  return Number(((val / PRICE_SCALE) * multiple).toFixed(10));
};

export const getUsageSourceByAuthType = ({
  shareId,
  authType
}: {
  shareId?: string;
  authType?: `${AuthUserTypeEnum}`;
}) => {
  if (shareId) return UsageSourceEnum.shareLink;
  if (authType === AuthUserTypeEnum.apikey) return UsageSourceEnum.api;
  return UsageSourceEnum.fastgpt;
};
