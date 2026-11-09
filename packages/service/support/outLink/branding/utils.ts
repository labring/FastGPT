import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type {
  OutLinkBrandConfigType,
  OutLinkBrandingType
} from '@fastgpt/global/support/outLink/branding';

/** 权益失效只影响本次展示，不修改用户偏好；查询异常时沿用原偏好，历史豁免始终保留。 */
export const resolveOutLinkBranding = ({
  enabled,
  type,
  isShowBrand,
  canHideShareBrand
}: {
  enabled: boolean;
  type: PublishChannelEnum;
  canHideShareBrand?: boolean;
} & OutLinkBrandConfigType): OutLinkBrandingType => {
  const active = enabled && type === PublishChannelEnum.share;
  return {
    enabled: active,
    showBrand:
      active && (isShowBrand === true || (isShowBrand === false && canHideShareBrand === false))
  };
};

/** 新记录始终由全局开关决定初值，不接受来源记录或客户端的品牌偏好。 */
export const getNewOutLinkBrandConfig = ({
  enabled,
  type
}: {
  enabled: boolean;
  type: PublishChannelEnum;
}): OutLinkBrandConfigType =>
  enabled && type === PublishChannelEnum.share ? { isShowBrand: true } : {};
