import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { type OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';

/**
 * 确保后台微信接口只能操作微信发布渠道。
 *
 * authOutLinkCrud 负责登录、teamId 和应用权限校验；这里补齐微信接口自己的渠道类型边界，
 * 避免同团队成员把其他发布渠道 ID 传入微信登录/登出接口后写入微信配置字段。
 */
export const assertWechatOutLink = (outLink: Pick<OutLinkSchemaType, 'type'>) => {
  if (outLink.type !== PublishChannelEnum.wechat) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }
};
