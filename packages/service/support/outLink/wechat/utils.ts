import { createHash } from 'node:crypto';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import type { OutLinkSchemaType, WechatAppType } from '@fastgpt/global/support/outLink/type';

/** 轮询和回复都要求连接在线且存在非空凭据。 */
export const isActiveWechatConnection = (
  app?: Pick<WechatAppType, 'status' | 'token'>
): app is { status: 'online'; token: string } =>
  app?.status === 'online' && typeof app.token === 'string' && app.token !== '';

/** 历史渠道重新扫码前使用登录快照的哈希，Redis 和队列只存不透明绑定标识。 */
export const getWechatBindingKey = (
  app: Pick<WechatAppType, 'bindingId' | 'loginTime' | 'token'>
) =>
  app.bindingId ??
  createHash('sha256')
    .update(JSON.stringify([app.loginTime ?? null, app.token]))
    .digest('hex');

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
