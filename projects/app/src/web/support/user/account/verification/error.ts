import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { getErrResponse, getErrText } from '@fastgpt/global/common/error/utils';

const accountVerificationRateLimitStatusTexts = new Set<string>([
  UserErrEnum.sendVerificationCodeTooFrequently,
  UserErrEnum.verifyCodeTooFrequently
]);
const legacyAccountVerificationRateLimitErrors = new Set([
  'common:error.send_auth_code_too_frequently',
  'common:error.verify_code_too_frequently'
]);
const verificationCodeError = 'common:error.code_error';

/** 识别图片验证码或账号验证码错误，避免统一降级为身份验证失败。 */
export const isAccountVerificationCodeError = (error: unknown) =>
  getErrResponse(error)?.statusText === UserErrEnum.invalidVerificationCode ||
  getErrText(error) === verificationCodeError;

/** 统一识别账号验证码发送与校验阶段的频控错误，并兼容旧版 message 返回。 */
export const isAccountVerificationRateLimitError = (error: unknown) => {
  const statusText = getErrResponse(error)?.statusText;
  return (
    accountVerificationRateLimitStatusTexts.has(statusText) ||
    legacyAccountVerificationRateLimitErrors.has(getErrText(error))
  );
};
