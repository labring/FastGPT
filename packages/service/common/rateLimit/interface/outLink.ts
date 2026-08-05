import { UserError } from '@fastgpt/global/common/error/utils';
import { defineRateLimitInterface } from '../core';
import { RateLimitSceneEnum } from '../type';

type OutLinkRateLimitParams = {
  outLinkId: string;
  uid: string;
  limit: number;
};

const outLinkRateLimit = defineRateLimitInterface<OutLinkRateLimitParams>({
  scene: RateLimitSceneEnum.OutLink,
  policy: 'request',
  failureMode: 'open',
  getKeySegments: ({ outLinkId, uid }) => ['out-link', outLinkId, 'uid', uid],
  getLimit: ({ limit }) => limit,
  getWindowSeconds: () => 60,
  createError: ({ limit }) => new UserError(`每分钟仅能请求 ${limit} 次~`)
});

/** 按外链 ID 和访问者 UID 的组合限制每分钟访问次数。 */
export const assertOutLinkRateLimit = outLinkRateLimit.assert;
