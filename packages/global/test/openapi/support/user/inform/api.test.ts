import { describe, expect, it } from 'vitest';
import { VerificationCodeTypeEnum } from '@fastgpt/global/support/user/account/verification/constants';
import { SendAuthCodeBodySchema } from '@fastgpt/global/openapi/support/user/inform/api';

const common = {
  username: 'user@example.com',
  captcha: 'A1B2C3',
  lang: 'zh-CN' as const
};

describe('SendAuthCodeBodySchema', () => {
  it.each([
    [VerificationCodeTypeEnum.register, 'register'],
    [VerificationCodeTypeEnum.findPassword, 'forgetPassword'],
    [VerificationCodeTypeEnum.bindNotification, 'bindNotification']
  ] as const)('accepts the purpose assigned to %s', (type, purpose) => {
    expect(SendAuthCodeBodySchema.parse({ ...common, type, purpose })).toMatchObject({
      type,
      purpose
    });
  });

  it.each([
    [VerificationCodeTypeEnum.register, 'forgetPassword'],
    [VerificationCodeTypeEnum.findPassword, 'register'],
    [VerificationCodeTypeEnum.bindNotification, 'login'],
    [VerificationCodeTypeEnum.register, 'arbitrary-purpose']
  ] as const)('rejects %s with an invalid purpose %s', (type, purpose) => {
    expect(() => SendAuthCodeBodySchema.parse({ ...common, type, purpose })).toThrow();
  });

  it('rejects code types outside the public send-code capabilities', () => {
    expect(() =>
      SendAuthCodeBodySchema.parse({
        ...common,
        type: VerificationCodeTypeEnum.unsubscribe,
        purpose: 'unsubscribe'
      })
    ).toThrow();
  });

  it('trims captcha input and keeps its stricter 64-character limit', () => {
    expect(
      SendAuthCodeBodySchema.parse({
        ...common,
        captcha: '  A1B2C3  ',
        type: VerificationCodeTypeEnum.register,
        purpose: 'register'
      }).captcha
    ).toBe('A1B2C3');
    expect(() =>
      SendAuthCodeBodySchema.parse({
        ...common,
        captcha: 'a'.repeat(65),
        type: VerificationCodeTypeEnum.register,
        purpose: 'register'
      })
    ).toThrow();
  });

  it('rejects a blank captcha after trimming', () => {
    expect(() =>
      SendAuthCodeBodySchema.parse({
        ...common,
        captcha: '   ',
        type: VerificationCodeTypeEnum.register,
        purpose: 'register'
      })
    ).toThrow();
  });
});
