import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { defineRateLimitInterface } from '../core';
import { RateLimitSceneEnum } from '../type';

const brandRequestRateLimit = defineRateLimitInterface<{ ip: string }>({
  scene: RateLimitSceneEnum.OutLink,
  policy: 'brand-request',
  failureMode: 'closed',
  getKeySegments: ({ ip }) => ['ip', ip],
  getLimit: () => 300,
  getWindowSeconds: () => 60,
  createError: () => ERROR_ENUM.tooManyRequest
});

const brandWriteRateLimit = defineRateLimitInterface<{ outLinkId: string; ip: string }>({
  scene: RateLimitSceneEnum.OutLink,
  policy: 'brand-write',
  failureMode: 'closed',
  getKeySegments: ({ outLinkId, ip }) => ['out-link', outLinkId, 'ip', ip],
  // 曝光重试与点击共用额度，预留共享出口和正常重试空间，不能按客户端可轮换的 UID 限流。
  getLimit: () => 60,
  getWindowSeconds: () => 60,
  createError: () => ERROR_ENUM.tooManyRequest
});

/** 在外链鉴权前限制单个 IP 的品牌请求；Redis 故障时停止非关键埋点。 */
export const assertOutLinkBrandRequestRateLimit = brandRequestRateLimit.assert;

/** 按服务端解析的外链 ID 与 IP 限制品牌写入，独立于聊天 QPM。 */
export const assertOutLinkBrandWriteRateLimit = brandWriteRateLimit.assert;
