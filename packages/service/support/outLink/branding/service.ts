import type { OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import type {
  OutLinkBrandConfigType,
  OutLinkBrandingType
} from '@fastgpt/global/support/outLink/branding';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { serviceEnv } from '../../../env';
import { getLogger, LogCategories } from '../../../common/logger';
import { resolveOutLinkBranding } from './utils';

const logger = getLogger(LogCategories.SYSTEM);

/**
 * 解析单个链接的有效品牌状态，权益始终按该链接的所属团队查询。
 * 仅计算展示状态；读取异常时保留用户偏好，权益恢复后自动生效。
 */
export const getOutLinkBranding = async ({
  outLink,
  getTeamCanHideShareBrand
}: {
  outLink: OutLinkSchemaType;
  getTeamCanHideShareBrand: (teamId: string) => Promise<boolean>;
}): Promise<OutLinkBrandingType> => {
  const enabled = serviceEnv.SHOW_OUTLINK_BRAND;
  const teamId = String(outLink.teamId);
  const needsQualification =
    enabled && outLink.type === PublishChannelEnum.share && outLink.isShowBrand === false;
  const canHideShareBrand = needsQualification
    ? await getTeamCanHideShareBrand(teamId).catch((error) => {
        logger.error('Failed to read share branding entitlement', { error, teamId });
        return undefined;
      })
    : undefined;

  return resolveOutLinkBranding({
    enabled,
    type: outLink.type,
    isShowBrand: outLink.isShowBrand,
    canHideShareBrand
  });
};

/** 更新仅处理明确提交且实际改变的品牌偏好，关闭操作每次重新校验所属团队权益。 */
export const getOutLinkBrandUpdate = async ({
  outLink,
  isShowBrand,
  getTeamCanHideShareBrand
}: {
  outLink: OutLinkSchemaType;
  getTeamCanHideShareBrand: (teamId: string) => Promise<boolean>;
} & OutLinkBrandConfigType): Promise<OutLinkBrandConfigType> => {
  if (
    !serviceEnv.SHOW_OUTLINK_BRAND ||
    outLink.type !== PublishChannelEnum.share ||
    isShowBrand === undefined ||
    isShowBrand === outLink.isShowBrand
  )
    return {};

  if (isShowBrand === false && !(await getTeamCanHideShareBrand(String(outLink.teamId)))) {
    return Promise.reject(OutLinkErrEnum.cannotHideBrand);
  }
  return { isShowBrand };
};
