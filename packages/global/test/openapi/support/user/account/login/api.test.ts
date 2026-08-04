import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../../../../openapi/provider/devapi';
import { openAPIPaths } from '../../../../../../openapi/path';
import {
  FastLoginBodySchema,
  LoginByPasswordBodySchema,
  LoginSuccessResponseSchema,
  OauthLoginBodySchema,
  PreLoginQuerySchema,
  WecomGetRedirectURLBodySchema,
  WxLoginBodySchema,
  WxLoginResultResponseSchema
} from '../../../../../../openapi/support/user/account/login/api';
import { GetImgCaptchaQuerySchema } from '../../../../../../openapi/support/user/account/captcha/api';
import {
  ResetExpiredPswBodySchema,
  UpdatePasswordByCodeBodySchema,
  UpdatePasswordByOldBodySchema
} from '../../../../../../openapi/support/user/account/password/api';
import { AccountRegisterBodySchema } from '../../../../../../openapi/support/user/account/register/api';
import {
  AccountEmailUsernameSchema,
  ExternalAuthStringSchema,
  ShortAuthStringSchema
} from '../../../../../../support/user/account/verification/type';

const captchaPath = '/proApi/support/user/account/captcha/getImgCaptcha';

describe('user account OpenAPI contracts', () => {
  it('registers the image captcha route in the generated Dev API document', () => {
    expect(openAPIPaths[captchaPath]).toBeDefined();
    expect(openAPIDocument.paths?.[captchaPath]).toBeDefined();
    expect(openAPIPaths['/api/support/user/account/captcha/getImgCaptcha']).toBeUndefined();
  });

  it('declares null while the WeChat QR login is waiting for a scan', () => {
    expect(WxLoginResultResponseSchema.parse(null)).toBeNull();
  });

  it('uses independent boundaries for short, external, and email authentication values', () => {
    const longExternalValue = 'a'.repeat(300);
    const longEmail = `${'a'.repeat(120)}@example.com`;

    expect(ShortAuthStringSchema.parse('  auth-value  ')).toBe('auth-value');
    expect(ShortAuthStringSchema.parse('a'.repeat(100))).toHaveLength(100);
    expect(() => ShortAuthStringSchema.parse('a'.repeat(101))).toThrow();
    expect(() => ShortAuthStringSchema.parse('   ')).toThrow();

    expect(ExternalAuthStringSchema.parse(longExternalValue)).toBe(longExternalValue);
    expect(() => ExternalAuthStringSchema.parse('   ')).toThrow();

    expect(AccountEmailUsernameSchema.parse(`  ${longEmail}  `)).toBe(longEmail);
    expect(() => AccountEmailUsernameSchema.parse(`${'a'.repeat(245)}@example.com`)).toThrow();
  });

  it('limits known short authentication material without truncating external values', () => {
    const longExternalValue = 'a'.repeat(300);
    const longEmail = `${'a'.repeat(120)}@example.com`;
    const tooLongShortValue = 'a'.repeat(101);

    expect(PreLoginQuerySchema.parse({ username: '  admin  ' })).toEqual({ username: 'admin' });
    expect(PreLoginQuerySchema.parse({ username: longEmail })).toEqual({ username: longEmail });
    expect(() =>
      LoginByPasswordBodySchema.parse({
        username: 'admin',
        password: tooLongShortValue,
        code: 'code'
      })
    ).toThrow();
    expect(GetImgCaptchaQuerySchema.parse({ username: longEmail, purpose: 'register' })).toEqual({
      username: longEmail,
      purpose: 'register'
    });
    expect(() =>
      UpdatePasswordByCodeBodySchema.parse({
        username: 'user@example.com',
        code: tooLongShortValue,
        password: 'password'
      })
    ).toThrow();
    expect(
      AccountRegisterBodySchema.parse({
        username: 'user@example.com',
        code: 'code',
        password: 'password',
        inviterId: longExternalValue
      })
    ).toMatchObject({ inviterId: longExternalValue });
    expect(
      OauthLoginBodySchema.parse({
        type: 'github',
        callbackUrl: longExternalValue,
        props: { access_token: longExternalValue }
      })
    ).toMatchObject({ callbackUrl: longExternalValue, props: { access_token: longExternalValue } });
    expect(FastLoginBodySchema.parse({ token: longExternalValue, code: 'code' })).toMatchObject({
      token: longExternalValue
    });
    expect(() => WxLoginBodySchema.parse({ code: tooLongShortValue })).toThrow();
    expect(
      WecomGetRedirectURLBodySchema.parse({
        redirectUri: longExternalValue,
        state: 'state',
        isWecomWorkTerminal: false
      })
    ).toMatchObject({ redirectUri: longExternalValue });
    expect(() =>
      WecomGetRedirectURLBodySchema.parse({
        redirectUri: 'https://fastgpt.example.com',
        state: tooLongShortValue,
        isWecomWorkTerminal: false
      })
    ).toThrow();
  });

  it.each([
    ['old password', UpdatePasswordByOldBodySchema, { oldPsw: 'a'.repeat(101), newPsw: 'new' }],
    ['new password', UpdatePasswordByOldBodySchema, { oldPsw: 'old', newPsw: 'a'.repeat(101) }],
    ['expired password', ResetExpiredPswBodySchema, { newPsw: 'a'.repeat(101) }]
  ] as const)('rejects an overlong %s', (_name, schema, body) => {
    expect(() => schema.parse(body)).toThrow();
  });

  it.each([
    ['old password', UpdatePasswordByOldBodySchema, { oldPsw: '   ', newPsw: 'new' }],
    ['new password', UpdatePasswordByOldBodySchema, { oldPsw: 'old', newPsw: '   ' }],
    ['expired password', ResetExpiredPswBodySchema, { newPsw: '   ' }]
  ] as const)('rejects a blank %s', (_name, schema, body) => {
    expect(() => schema.parse(body)).toThrow();
  });

  it('does not apply request limits to authentication response strings', () => {
    const longToken = 't'.repeat(101);

    expect(
      LoginSuccessResponseSchema.parse({
        user: {},
        token: longToken
      }).token
    ).toBe(longToken);
  });
});
