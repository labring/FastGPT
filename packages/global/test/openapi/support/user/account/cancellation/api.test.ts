import { describe, expect, it } from 'vitest';
import {
  CreateAccountCancellationVerificationBodySchema,
  SubmitAccountCancellationBodySchema
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

  it('does not accept username, scene, or extra submit fields', () => {
    expect(() =>
      SubmitAccountCancellationBodySchema.parse({
        method: 'code',
        payload: { code: '123456' },
        username: 'user@example.com'
      })
    ).toThrow();
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
});
