import { createHash } from 'node:crypto';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import type { OutLinkSchemaType, WechatAppType } from '@fastgpt/global/support/outLink/type';

/** 轮询和回复都要求连接在线且存在非空凭据。 */
export const isActiveWechatConnection = (
  app?: Pick<WechatAppType, 'status' | 'token'>
): app is { status: 'online'; token: string } =>
  app?.status === 'online' && typeof app.token === 'string' && app.token !== '';

/** 只保存登录快照的哈希，避免凭据进入 Redis key 或队列。 */
export const getWechatLoginFingerprint = (app: Pick<WechatAppType, 'loginTime' | 'token'>) =>
  createHash('sha256')
    .update(JSON.stringify([app.loginTime ?? null, app.token]))
    .digest('hex');

/** 旧版重绑会改写登录快照，但不会清理新增字段。只使用仍对应当前登录的绑定 ID。 */
export const getWechatBindingIdentity = (
  app: Pick<WechatAppType, 'bindingId' | 'bindingFingerprint' | 'loginTime' | 'token'>
) => {
  const fingerprint = getWechatLoginFingerprint(app);
  const id = app.bindingFingerprint === fingerprint ? app.bindingId : undefined;
  return { id, key: id ?? fingerprint, loginTime: app.loginTime };
};

/** 仅历史绑定兼容无绑定键的旧任务，入队时间用于排除明显早于当前登录的任务。 */
export const matchesWechatReplyBinding = (
  binding: ReturnType<typeof getWechatBindingIdentity>,
  job: { bindingKey?: string; timestamp: number }
) => {
  if (job.bindingKey !== undefined) return job.bindingKey === binding.key;
  if (binding.id !== undefined) return false;
  const loggedInAt = Date.parse(binding.loginTime ?? '');
  return !Number.isFinite(loggedInAt) || job.timestamp >= loggedInAt;
};

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
