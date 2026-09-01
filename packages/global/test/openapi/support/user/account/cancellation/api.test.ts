import { describe, expect, it } from 'vitest';
import {
  CreateAccountCancellationVerificationBodySchema,
  SubmitAccountCancellationBodySchema,
  SubmitAccountCancellationResponseSchema
} from '@fastgpt/global/openapi/support/user/account/cancellation/api';

describe('account cancellation API contracts', () => {
  it('accepts only the non-password create methods', () => {
    expect(
      CreateAccountCancellationVerificationBodySchema.parse({
        method: 'code',
        payload: { captcha: 'A1B2C3' }
      }).method
    ).toBe('code');
    expect(() =>
      CreateAccountCancellationVerificationBodySchema.parse({
        method: 'oldPassword',
        payload: { password: 'secret' }
      })
    ).toThrow();
  });

  it('strips unknown submit fields while rejecting unsupported methods', () => {
    expect(
      SubmitAccountCancellationBodySchema.parse({
        method: 'code',
        payload: { code: '123456', legacyScene: 'account-cancellation' },
        username: 'user@example.com'
      })
    ).toEqual({ method: 'code', payload: { code: '123456' } });
    expect(() =>
      SubmitAccountCancellationBodySchema.parse({
        method: 'oldPassword',
        payload: { password: 'secret' }
      })
    ).toThrow();
  });

  it('bounds SSO callback props', () => {
    const props = Object.fromEntries(
      Array.from({ length: 21 }, (_, index) => [`key${index}`, 'value'])
    );
    expect(() =>
      SubmitAccountCancellationBodySchema.parse({
        method: 'oauth/sso',
        payload: {
          callbackUrl: 'https://fastgpt.example.com/login/provider',
          code: 'provider-code',
          props
        }
      })
    ).toThrow();
  });

  it('exposes WeChat verification expiry as a polling result', () => {
    expect(
      SubmitAccountCancellationResponseSchema.parse({ status: 'verificationExpired' })
    ).toEqual({ status: 'verificationExpired' });
  });
});
