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

/** 识别轮询期间可恢复的 网络、超时、频控和服务端暂时错误。 */
export const isRetryableAccountVerificationPollingError = (error: unknown) => {
  const response = getErrResponse(error) as
    | { status?: number; statusCode?: number; code?: number | string }
    | undefined;
  const errorCode = response?.code;
  const status = response?.status ?? response?.statusCode;
  const numericCode = typeof errorCode === 'number' ? errorCode : Number(errorCode);
  const numericStatus = typeof status === 'number' ? status : Number(status);
  const networkErrorCodes = new Set([
    'ECONNABORTED',
    'ETIMEDOUT',
    'ERR_NETWORK',
    'ERR_CONNECTION_RESET'
  ]);
  const code = typeof errorCode === 'string' ? errorCode : undefined;

  return (
    numericStatus === 408 ||
    numericStatus === 429 ||
    (numericStatus >= 500 && numericStatus < 600) ||
    numericCode === 408 ||
    numericCode === 429 ||
    (numericCode >= 500 && numericCode < 600) ||
    networkErrorCodes.has(code ?? '') ||
    getErrText(error) === 'Network Error'
  );
};
