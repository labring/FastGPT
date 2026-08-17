import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { getErrResponse, getErrText } from '@fastgpt/global/common/error/utils';

const accountCancellationRateLimitStatusTexts = new Set<string>([
  UserErrEnum.sendVerificationCodeTooFrequently,
  UserErrEnum.verifyCodeTooFrequently
]);
const legacyAccountCancellationRateLimitErrors = new Set([
  'common:error.send_auth_code_too_frequently',
  'common:error.verify_code_too_frequently'
]);

const verificationCodeError = 'common:error.code_error';

/** 统一识别注销验证码发送与校验阶段的频控错误。 */
export const isAccountCancellationRateLimitError = (error: unknown) => {
  const statusText = getErrResponse(error)?.statusText;
  return (
    accountCancellationRateLimitStatusTexts.has(statusText) ||
    legacyAccountCancellationRateLimitErrors.has(getErrText(error))
  );
};

/** 识别图片验证码错误，避免发送阶段统一降级为“验证码发送失败”。 */
export const isAccountCancellationCodeError = (error: unknown) =>
  getErrResponse(error)?.statusText === UserErrEnum.invalidVerificationCode ||
  getErrText(error) === verificationCodeError;
