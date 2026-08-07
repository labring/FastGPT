import { describe, expect, it } from 'vitest';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import {
  isAccountCancellationCodeError,
  isAccountCancellationRateLimitError
} from '@/pageComponents/account/cancel/utils';

describe('isAccountCancellationRateLimitError', () => {
  it.each([
    'common:error.send_auth_code_too_frequently',
    'common:error.verify_code_too_frequently'
  ])('recognizes %s', (message) => {
    expect(isAccountCancellationRateLimitError(new Error(message))).toBe(true);
  });

  it('recognizes an error returned by the request client', () => {
    expect(
      isAccountCancellationRateLimitError({
        response: { data: { message: 'common:error.send_auth_code_too_frequently' } }
      })
    ).toBe(true);
  });

  it.each([UserErrEnum.sendVerificationCodeTooFrequently, UserErrEnum.verifyCodeTooFrequently])(
    'recognizes stable statusText %s',
    (statusText) => {
      expect(isAccountCancellationRateLimitError({ statusText })).toBe(true);
    }
  );

  it('does not classify unrelated verification failures as rate limits', () => {
    expect(isAccountCancellationRateLimitError(new Error('common:error.code_error'))).toBe(false);
  });
});

describe('isAccountCancellationCodeError', () => {
  it('recognizes a verification code error', () => {
    expect(isAccountCancellationCodeError(new Error('common:error.code_error'))).toBe(true);
  });

  it('recognizes an error returned by the request client', () => {
    expect(
      isAccountCancellationCodeError({
        response: { data: { message: 'common:error.code_error' } }
      })
    ).toBe(true);
  });

  it('recognizes the stable invalid verification code statusText', () => {
    expect(
      isAccountCancellationCodeError({
        statusText: UserErrEnum.invalidVerificationCode,
        message: 'localized message may change'
      })
    ).toBe(true);
  });

  it('does not classify other send failures as verification code errors', () => {
    expect(isAccountCancellationCodeError(new Error('common:error.send_failed'))).toBe(false);
  });
});
