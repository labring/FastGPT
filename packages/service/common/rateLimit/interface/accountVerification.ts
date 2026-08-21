import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { VerificationScene } from '@fastgpt/global/support/user/account/verification/type';
import { defineRateLimitInterface } from '../core';
import { RateLimitSceneEnum } from '../type';

const CodeVerificationConsumeQpm = 10;
const CodeVerificationConsumeWindowSeconds = 60;

type AccountVerificationRateLimitAction =
  | 'code-consume'
  | 'captcha-create'
  | 'captcha-consume'
  | 'password-create'
  | 'password-consume';

type AccountVerificationRateLimitParams = {
  account: string;
  scene: string;
  action: AccountVerificationRateLimitAction;
  limit?: number;
  seconds?: number;
};

type PasswordRateLimitScene = VerificationScene<'password'> | 'admin-login';

const accountVerificationRateLimit = defineRateLimitInterface<AccountVerificationRateLimitParams>({
  scene: RateLimitSceneEnum.AccountVerification,
  policy: ({ action }) => action,
  failureMode: 'open',
  getKeySegments: ({ scene, account }) => [scene, 'account', account],
  getLimit: ({ limit }) => limit ?? CodeVerificationConsumeQpm,
  getWindowSeconds: ({ seconds }) => seconds ?? CodeVerificationConsumeWindowSeconds,
  createError: () => new UserError(UserErrEnum.verifyCodeTooFrequently)
});

/** 按账号和场景限制验证码消费次数，错误和成功提交都占用同一固定窗口。 */
export const assertCodeVerificationConsumeRateLimit = (params: {
  account: string;
  scene: VerificationScene<'code'>;
}) => accountVerificationRateLimit.assert({ ...params, action: 'code-consume' });

/** 按账号和场景限制图片验证码生成次数。 */
export const assertCaptchaVerificationCreateRateLimit = (params: {
  account: string;
  scene: VerificationScene<'captcha'>;
}) => accountVerificationRateLimit.assert({ ...params, action: 'captcha-create' });

/** 按账号和场景限制图片验证码确认次数。 */
export const assertCaptchaVerificationConsumeRateLimit = (params: {
  account: string;
  scene: VerificationScene<'captcha'>;
}) => accountVerificationRateLimit.assert({ ...params, action: 'captcha-consume' });

/** 按账号限制每分钟预登录码生成次数。 */
export const assertPasswordVerificationCreateRateLimit = (params: {
  account: string;
  scene: PasswordRateLimitScene;
  limit: number;
}) => accountVerificationRateLimit.assert({ ...params, action: 'password-create' });

/** 按账号限制每分钟预登录码和密码的联合校验次数。 */
export const assertPasswordVerificationConsumeRateLimit = (params: {
  account: string;
  scene: PasswordRateLimitScene;
  limit: number;
}) => accountVerificationRateLimit.assert({ ...params, action: 'password-consume' });
