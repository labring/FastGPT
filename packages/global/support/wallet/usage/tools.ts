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

/** 账单只记录实际发生的缓存用量，历史零值也按无用量显示。 */
export const getUsedCacheTokens = (tokens = 0) =>
  tokens > 0 && Number.isFinite(tokens) ? tokens : undefined;

/** 提取正值缓存 Token 字段，省略零值与未定义项，供节点响应构造统一复用。 */
export const pickUsedCacheTokens = ({
  cacheReadTokens,
  cacheCreationTokens
}: {
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}) => {
  const usedCacheReadTokens = getUsedCacheTokens(cacheReadTokens);
  const usedCacheCreationTokens = getUsedCacheTokens(cacheCreationTokens);

  return {
    ...(usedCacheReadTokens !== undefined ? { cacheReadTokens: usedCacheReadTokens } : {}),
    ...(usedCacheCreationTokens !== undefined
      ? { cacheCreationTokens: usedCacheCreationTokens }
      : {})
  };
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

/** 将发布渠道映射为计费来源，企微 Webhook 与长连接共用现有企微账单分类。 */
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
    case PublishChannelEnum.wecomWebsocket:
      return UsageSourceEnum.wecom;
    case PublishChannelEnum.wechat:
      return UsageSourceEnum.wechat;
    case PublishChannelEnum.officialAccount:
      return UsageSourceEnum.official_account;
    case PublishChannelEnum.dingtalk:
      return UsageSourceEnum.dingtalk;
    default:
      return UsageSourceEnum.fastgpt;
  }
};
