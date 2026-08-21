import { EnterpriseAuthErrEnum } from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import { defineRateLimitInterface } from '../core';
import { RateLimitSceneEnum } from '../type';

const EnterpriseAuthStartQpm = 5;
const EnterpriseAuthVerifyAmountQpm = 3;
const EnterpriseAuthWindowSeconds = 60;

const enterpriseAuthStartRateLimit = defineRateLimitInterface<{ teamId: string }>({
  scene: RateLimitSceneEnum.EnterpriseAuth,
  policy: 'start',
  failureMode: 'open',
  getKeySegments: ({ teamId }) => ['team', teamId],
  getLimit: () => EnterpriseAuthStartQpm,
  getWindowSeconds: () => EnterpriseAuthWindowSeconds,
  createError: () => new Error(EnterpriseAuthErrEnum.tooFrequent)
});

const enterpriseAuthVerifyAmountRateLimit = defineRateLimitInterface<{ teamId: string }>({
  scene: RateLimitSceneEnum.EnterpriseAuth,
  policy: 'verify-amount',
  failureMode: 'open',
  getKeySegments: ({ teamId }) => ['team', teamId],
  getLimit: () => EnterpriseAuthVerifyAmountQpm,
  getWindowSeconds: () => EnterpriseAuthWindowSeconds,
  createError: () => new Error(EnterpriseAuthErrEnum.tooFrequent)
});

/** 消费企业认证发起额度；Redis 故障时保持原行为并放行。 */
export const checkEnterpriseAuthStartRateLimit = enterpriseAuthStartRateLimit.check;

/** 按团队限制企业认证金额校验次数。 */
export const assertEnterpriseAuthVerifyAmountRateLimit = enterpriseAuthVerifyAmountRateLimit.assert;
