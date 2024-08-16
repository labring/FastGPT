/* bill common  */
import { PRICE_SCALE } from '../constants';
import { UsageSourceEnum } from './constants';
import { AuthUserTypeEnum } from '../../permission/constant';
import { PublishChannelEnum } from '../../outLink/constant';

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

export const getUsageSourceByPublishChannel = (publishchannel: PublishChannelEnum) => {
  switch (publishchannel) {
    case PublishChannelEnum.share:
      return UsageSourceEnum.share;
    case PublishChannelEnum.iframe:
      return UsageSourceEnum.shareLink;
    case PublishChannelEnum.apikey:
      return UsageSourceEnum.api;
    case PublishChannelEnum.feishu:
      return UsageSourceEnum.feishu;
    case PublishChannelEnum.wecom:
      return UsageSourceEnum.wecom;
    case PublishChannelEnum.officialAccount:
      return UsageSourceEnum.official_account;
    default:
      return UsageSourceEnum.fastgpt;
  }
};
