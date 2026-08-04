import { describe, expect, it } from 'vitest';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { SendAuthCodeBodySchema } from '@fastgpt/global/openapi/support/user/inform/api';

const common = {
  username: 'user@example.com',
  captcha: 'A1B2C3',
  lang: 'zh-CN' as const
};

describe('SendAuthCodeBodySchema', () => {
  it.each([
    [UserAuthTypeEnum.register, 'register'],
    [UserAuthTypeEnum.findPassword, 'forgetPassword'],
    [UserAuthTypeEnum.bindNotification, 'bindNotification']
  ] as const)('accepts the purpose assigned to %s', (type, purpose) => {
    expect(SendAuthCodeBodySchema.parse({ ...common, type, purpose })).toMatchObject({
      type,
      purpose
    });
  });

  it.each([
    [UserAuthTypeEnum.register, 'forgetPassword'],
    [UserAuthTypeEnum.findPassword, 'register'],
    [UserAuthTypeEnum.bindNotification, 'login'],
    [UserAuthTypeEnum.register, 'arbitrary-purpose']
  ] as const)('rejects %s with an invalid purpose %s', (type, purpose) => {
    expect(() => SendAuthCodeBodySchema.parse({ ...common, type, purpose })).toThrow();
  });

  it('rejects code types outside the public send-code capabilities', () => {
    expect(() =>
      SendAuthCodeBodySchema.parse({
        ...common,
        type: UserAuthTypeEnum.login,
        purpose: 'login'
      })
    ).toThrow();
  });

  it('trims captcha input and keeps its stricter 64-character limit', () => {
    expect(
      SendAuthCodeBodySchema.parse({
        ...common,
        captcha: '  A1B2C3  ',
        type: UserAuthTypeEnum.register,
        purpose: 'register'
      }).captcha
    ).toBe('A1B2C3');
    expect(() =>
      SendAuthCodeBodySchema.parse({
        ...common,
        captcha: 'a'.repeat(65),
        type: UserAuthTypeEnum.register,
        purpose: 'register'
      })
    ).toThrow();
  });
});
