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
import { UpdatePasswordByCodeBodySchema } from '../../../../../../openapi/support/user/account/password/api';
import { AccountRegisterBodySchema } from '../../../../../../openapi/support/user/account/register/api';
import { PublicAuthStringSchema } from '../../../../../../support/user/account/verification/type';

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

  it('trims public authentication strings and rejects values over 100 characters', () => {
    expect(PublicAuthStringSchema.parse('  auth-value  ')).toBe('auth-value');
    expect(PublicAuthStringSchema.parse('a'.repeat(100))).toHaveLength(100);
    expect(() => PublicAuthStringSchema.parse('a'.repeat(101))).toThrow();
  });

  it('applies the shared string boundary to public authentication requests', () => {
    const tooLong = 'a'.repeat(101);

    expect(PreLoginQuerySchema.parse({ username: '  admin  ' })).toEqual({ username: 'admin' });
    expect(() =>
      LoginByPasswordBodySchema.parse({
        username: 'admin',
        password: tooLong,
        code: 'code'
      })
    ).toThrow();
    expect(() =>
      GetImgCaptchaQuerySchema.parse({ username: tooLong, purpose: 'register' })
    ).toThrow();
    expect(() =>
      UpdatePasswordByCodeBodySchema.parse({
        username: 'user@example.com',
        code: tooLong,
        password: 'password'
      })
    ).toThrow();
    expect(() =>
      AccountRegisterBodySchema.parse({
        username: 'user@example.com',
        code: 'code',
        password: 'password',
        inviterId: tooLong
      })
    ).toThrow();
    expect(() =>
      OauthLoginBodySchema.parse({ type: 'github', callbackUrl: tooLong, props: {} })
    ).toThrow();
    expect(() => FastLoginBodySchema.parse({ token: tooLong, code: 'code' })).toThrow();
    expect(() => WxLoginBodySchema.parse({ code: tooLong })).toThrow();
    expect(() =>
      WecomGetRedirectURLBodySchema.parse({
        redirectUri: 'https://fastgpt.example.com',
        state: tooLong,
        isWecomWorkTerminal: false
      })
    ).toThrow();
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
