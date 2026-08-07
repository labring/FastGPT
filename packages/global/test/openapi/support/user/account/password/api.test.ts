import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CreatePasswordVerificationBodySchema,
  PasswordAuthorizationBodySchema,
  SensitiveAccountVerificationBodySchema,
  UpdatePasswordBodySchema
} from '@fastgpt/global/openapi/support/user/account/password/api';
import type {
  CreatePasswordVerificationBody,
  CreatePasswordVerificationResponse,
  PasswordAuthorizationBody,
  SensitiveAccountVerificationBody
} from '@fastgpt/global/openapi/support/user/account/password/api';

describe('password API contracts', () => {
  it('preserves the inferred verification contracts', () => {
    expectTypeOf<CreatePasswordVerificationBody>().not.toBeAny();
    expectTypeOf<CreatePasswordVerificationResponse>().not.toBeAny();
    expectTypeOf<SensitiveAccountVerificationBody>().not.toBeAny();

    type AccountVerificationAuthorization = Extract<
      PasswordAuthorizationBody,
      { source: 'accountVerification' }
    >;
    expectTypeOf<AccountVerificationAuthorization>().toEqualTypeOf<{
      source: 'accountVerification';
      verification: SensitiveAccountVerificationBody;
    }>();
  });

  it('accepts an empty old-password create payload without client identity fields', () => {
    expect(
      CreatePasswordVerificationBodySchema.parse({ method: 'oldPassword', payload: {} })
    ).toEqual({ method: 'oldPassword', payload: {} });
    expect(() =>
      CreatePasswordVerificationBodySchema.parse({
        method: 'oldPassword',
        payload: {},
        username: 'other-user'
      })
    ).toThrow();
  });

  it('requires a bounded password digest and pre-login code for old-password consume', () => {
    const password = 'a'.repeat(64);
    expect(
      SensitiveAccountVerificationBodySchema.parse({
        method: 'oldPassword',
        payload: { password, preLoginCode: 'pre-login-code' }
      })
    ).toMatchObject({ method: 'oldPassword' });
    expect(() =>
      SensitiveAccountVerificationBodySchema.parse({
        method: 'oldPassword',
        payload: { password: 'plain-text', preLoginCode: 'pre-login-code' }
      })
    ).toThrow();
  });

  it('keeps the verification-flow initializer strict', () => {
    expect(PasswordAuthorizationBodySchema.parse({ source: 'verificationMethod' })).toEqual({
      source: 'verificationMethod'
    });
    expect(() =>
      PasswordAuthorizationBodySchema.parse({
        source: 'verificationMethod',
        userId: 'other-user'
      })
    ).toThrow();
    expect(() => PasswordAuthorizationBodySchema.parse({ source: 'recentLogin' })).toThrow();
  });

  it('requires a SHA-256 digest and a bounded authorization token for updates', () => {
    expect(
      UpdatePasswordBodySchema.parse({
        newPsw: 'b'.repeat(64),
        passwordChangeToken: 'token'
      })
    ).toBeDefined();
    expect(() =>
      UpdatePasswordBodySchema.parse({ newPsw: 'short', passwordChangeToken: 'token' })
    ).toThrow();
    expect(() =>
      UpdatePasswordBodySchema.parse({
        newPsw: 'b'.repeat(64),
        passwordChangeToken: 'token',
        confirmPsw: 'b'.repeat(64)
      })
    ).toThrow();
  });
});
