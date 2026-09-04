import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../../../../openapi/provider/devapi';
import { openAPIPaths } from '../../../../../../openapi/path';
import {
  FastLoginBodySchema,
  LoginByPasswordBodySchema,
  OpenAPIUserSchema,
  LoginSuccessResponseSchema,
  OauthLoginBodySchema,
  PreLoginQuerySchema,
  SsoGetAuthorizationURLBodySchema,
  WecomGetRedirectURLBodySchema,
  WxLoginBodySchema,
  WxLoginResultResponseSchema
} from '../../../../../../openapi/support/user/account/login/api';
import { GetImgCaptchaQuerySchema } from '../../../../../../openapi/support/user/account/captcha/api';
import { UpdatePasswordByCodeBodySchema } from '../../../../../../openapi/support/user/account/password/api';
import { AccountRegisterBodySchema } from '../../../../../../openapi/support/user/account/register/api';
import {
  AccountEmailUsernameSchema,
  ExternalAuthStringSchema,
  ShortAuthStringSchema
} from '../../../../../../support/user/account/verification/type';

const captchaPath = '/proApi/support/user/account/captcha/getImgCaptcha';
const ssoAuthorizationPath = '/proApi/support/user/account/login/getAuthURL';
const wecomRedirectPath = '/proApi/support/user/account/login/wecom/getRedirectUrl';
const updatePasswordByCodePath = '/proApi/support/user/account/password/updateByCode';
const objectId = '68ad85a7463006c963799a05';
const objectIdLike = { toString: () => objectId };

describe('user account OpenAPI contracts', () => {
  it('registers the image captcha route in the generated Dev API document', () => {
    expect(openAPIPaths[captchaPath]).toBeDefined();
    expect(openAPIDocument.paths?.[captchaPath]).toBeDefined();
    expect(openAPIPaths['/api/support/user/account/captcha/getImgCaptcha']).toBeUndefined();
  });

  it('registers and validates the SSO authorization URL route', () => {
    expect(openAPIPaths[ssoAuthorizationPath]).toBeDefined();
    expect(openAPIDocument.paths?.[ssoAuthorizationPath]).toBeDefined();
    expect(
      SsoGetAuthorizationURLBodySchema.parse({
        redirectUri: 'https://fastgpt.example.com/login',
        isWecomWorkTerminal: false
      })
    ).toEqual({
      redirectUri: 'https://fastgpt.example.com/login',
      isWecomWorkTerminal: false
    });
    expect(() =>
      SsoGetAuthorizationURLBodySchema.parse({
        redirectUri: 'https://fastgpt.example.com/login'
      })
    ).toThrow();
  });

  it('registers the WeCom redirect URL route', () => {
    expect(openAPIPaths[wecomRedirectPath]).toBeDefined();
    expect(openAPIDocument.paths?.[wecomRedirectPath]?.post?.tags).toEqual(['用户账号']);
  });

  it('registers the password update-by-code route under the Pro API path', () => {
    expect(openAPIPaths[updatePasswordByCodePath]).toBeDefined();
    expect(openAPIDocument.paths?.[updatePasswordByCodePath]?.post).toBeDefined();
    expect(openAPIPaths['/support/user/account/password/updateByCode']).toBeUndefined();
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
        password: 'password'
      })
    ).toMatchObject({ username: 'user@example.com' });
    expect(
      OauthLoginBodySchema.parse({
        type: 'github',
        callbackUrl: longExternalValue,
        props: { access_token: longExternalValue }
      })
    ).toMatchObject({ callbackUrl: longExternalValue, props: { access_token: longExternalValue } });
    expect(
      FastLoginBodySchema.parse({ token: longExternalValue, code: longExternalValue })
    ).toMatchObject({
      token: longExternalValue,
      code: longExternalValue
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

  it('strips a client-supplied team member ID from password reset input', () => {
    expect(
      UpdatePasswordByCodeBodySchema.parse({
        username: 'user@example.com',
        code: '123456',
        password: 'password',
        tmbId: 'another-user-team-member-id'
      })
    ).toEqual({
      username: 'user@example.com',
      code: '123456',
      password: 'password'
    });
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

  it('accepts user details when user and team notification contacts are null', () => {
    expect(
      OpenAPIUserSchema.parse({
        _id: objectIdLike,
        username: 'user@example.com',
        avatar: '/icon/avatar.svg',
        timezone: 'Asia/Shanghai',
        contact: null,
        hasPassword: true,
        team: {
          userId: objectIdLike,
          teamId: objectIdLike,
          teamName: 'FastGPT 团队',
          memberName: '普通成员',
          avatar: '/icon/avatar.svg',
          tmbId: objectIdLike,
          status: 'active',
          notificationAccount: null,
          permission: {}
        },
        permission: {}
      })
    ).toMatchObject({
      _id: objectId,
      contact: null,
      team: {
        notificationAccount: null
      }
    });
  });

  it('accepts user details whose legacy team role is absent', () => {
    expect(
      OpenAPIUserSchema.parse({
        _id: objectIdLike,
        username: 'user@example.com',
        avatar: '/icon/avatar.svg',
        timezone: 'Asia/Shanghai',
        hasPassword: true,
        team: {
          userId: objectIdLike,
          teamId: objectIdLike,
          teamName: 'FastGPT 团队',
          memberName: '普通成员',
          avatar: '/icon/avatar.svg',
          tmbId: objectIdLike,
          status: 'active',
          permission: {}
        },
        permission: {}
      })
    ).toMatchObject({
      _id: objectId,
      team: {
        tmbId: objectId,
        status: 'active'
      }
    });
  });
});
