import { describe, expect, it } from 'vitest';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import {
  isAccountVerificationCodeError,
  isAccountVerificationRateLimitError
} from '@/web/support/user/account/verification/error';

describe('isAccountVerificationCodeError', () => {
  it('recognizes a verification code error', () => {
    expect(isAccountVerificationCodeError(new Error('common:error.code_error'))).toBe(true);
  });

  it('recognizes an error returned by the request client', () => {
    expect(
      isAccountVerificationCodeError({
        response: { data: { message: 'common:error.code_error' } }
      })
    ).toBe(true);
  });

  it('recognizes the stable invalid verification code statusText', () => {
    expect(
      isAccountVerificationCodeError({
        statusText: UserErrEnum.invalidVerificationCode,
        message: 'localized message may change'
      })
    ).toBe(true);
  });

  it('does not classify other send failures as verification code errors', () => {
    expect(isAccountVerificationCodeError(new Error('common:error.send_failed'))).toBe(false);
  });
});

describe('isAccountVerificationRateLimitError', () => {
  it.each([
    'common:error.send_auth_code_too_frequently',
    'common:error.verify_code_too_frequently'
  ])('recognizes legacy message %s', (message) => {
    expect(isAccountVerificationRateLimitError(new Error(message))).toBe(true);
  });

  it('recognizes an error returned by the request client', () => {
    expect(
      isAccountVerificationRateLimitError({
        response: { data: { message: 'common:error.send_auth_code_too_frequently' } }
      })
    ).toBe(true);
  });

  it.each([UserErrEnum.sendVerificationCodeTooFrequently, UserErrEnum.verifyCodeTooFrequently])(
    'recognizes stable statusText %s',
    (statusText) => {
      expect(isAccountVerificationRateLimitError({ statusText })).toBe(true);
    }
  );

  it('does not classify unrelated verification failures as rate limits', () => {
    expect(isAccountVerificationRateLimitError(new Error('common:error.code_error'))).toBe(false);
  });
});
