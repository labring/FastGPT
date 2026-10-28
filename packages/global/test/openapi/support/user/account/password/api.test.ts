import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CreatePasswordVerificationBodySchema,
  PasswordAuthorizationBodySchema,
  SensitiveAccountVerificationBodySchema,
  UpdatePasswordBodySchema,
  UpdateRootPasswordBodySchema
} from '@fastgpt/global/openapi/support/user/account/password/api';
import type {
  CreatePasswordVerificationBody,
  CreatePasswordVerificationResponse,
  PasswordAuthorizationBody,
  SensitiveAccountVerificationBody
} from '@fastgpt/global/openapi/support/user/account/password/api';

describe('password API contracts', () => {
  it('preserves inferred verification contracts', () => {
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

  it('requires a bounded password digest for old-password verification', () => {
    expect(
      SensitiveAccountVerificationBodySchema.parse({
        method: 'oldPassword',
        payload: { password: 'a'.repeat(64) }
      })
    ).toMatchObject({ method: 'oldPassword' });
    expect(() =>
      SensitiveAccountVerificationBodySchema.parse({
        method: 'oldPassword',
        payload: { password: 'plain-text' }
      })
    ).toThrow();
    expect(() =>
      SensitiveAccountVerificationBodySchema.parse({
        method: 'oldPassword',
        payload: { password: 'a'.repeat(64), preLoginCode: 'unused' }
      })
    ).toThrow();
  });

  it('keeps the verification-flow initializer strict', () => {
    expect(PasswordAuthorizationBodySchema.parse({ source: 'verificationMethod' })).toEqual({
      source: 'verificationMethod'
    });
    expect(() =>
      PasswordAuthorizationBodySchema.parse({ source: 'verificationMethod', userId: 'other-user' })
    ).toThrow();
    expect(() => PasswordAuthorizationBodySchema.parse({ source: 'recentLogin' })).toThrow();
  });

  it('requires a SHA-256 digest and bounded authorization token', () => {
    expect(
      UpdatePasswordBodySchema.parse({
        newPsw: 'b'.repeat(64),
        passwordChangeSession: 'session'
      })
    ).toBeDefined();
    expect(() => UpdatePasswordBodySchema.parse({ newPsw: 'b'.repeat(64) })).toThrow();
    expect(() =>
      UpdatePasswordBodySchema.parse({ newPsw: 'short', passwordChangeSession: 'session' })
    ).toThrow();
    expect(() =>
      UpdatePasswordBodySchema.parse({
        newPsw: 'b'.repeat(64),
        passwordChangeSession: 'session',
        confirmPsw: 'b'.repeat(64)
      })
    ).toThrow();
  });

  it('validates the open-source root password change payload', () => {
    expect(
      UpdateRootPasswordBodySchema.parse({ oldPsw: 'c'.repeat(64), newPsw: 'b'.repeat(64) })
    ).toBeDefined();
    expect(UpdateRootPasswordBodySchema.parse({ newPsw: 'b'.repeat(64) })).toBeDefined();
    // 旧密码同样必须是摘要，不能把明文透传到服务端。
    expect(() =>
      UpdateRootPasswordBodySchema.parse({ oldPsw: 'plain-password', newPsw: 'b'.repeat(64) })
    ).toThrow();
    expect(() =>
      UpdateRootPasswordBodySchema.parse({
        oldPsw: 'c'.repeat(64),
        newPsw: 'b'.repeat(64),
        passwordChangeSession: 'session'
      })
    ).toThrow();
  });
});
