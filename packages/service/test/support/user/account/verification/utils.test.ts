import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  assertCaptchaVerificationConsumeFrequency,
  assertCaptchaVerificationCreateFrequency,
  assertCodeVerificationConsumeFrequency,
  assertPasswordVerificationCreateFrequency,
  assertPasswordVerificationConsumeFrequency
} from '@fastgpt/service/support/user/account/verification/utils';

describe('assertCodeVerificationConsumeFrequency', () => {
  const account = 'verification-rate-limit@example.com';
  const key = `account-verification:code:consume:register:${account}`;

  beforeEach(async () => {
    await getGlobalRedisConnection().del(key);
  });

  it('allows 10 attempts and rejects the 11th attempt', async () => {
    const params = { account, scene: 'register' };

    for (let index = 0; index < 10; index++) {
      await expect(assertCodeVerificationConsumeFrequency(params)).resolves.toBeUndefined();
    }

    await expect(assertCodeVerificationConsumeFrequency(params)).rejects.toThrow(
      UserErrEnum.verifyCodeTooFrequently
    );
  });

  it('keeps accounts and scenes independent', async () => {
    const params = { account, scene: 'register' };
    for (let index = 0; index < 10; index++) {
      await assertCodeVerificationConsumeFrequency(params);
    }

    await expect(
      assertCodeVerificationConsumeFrequency({ account: 'other@example.com', scene: 'register' })
    ).resolves.toBeUndefined();
    await expect(
      assertCodeVerificationConsumeFrequency({ account, scene: 'findPassword' })
    ).resolves.toBeUndefined();
  });
});

describe('account verification frequency actions', () => {
  const account = 'verification-actions@example.com';
  const keys = [
    `account-verification:captcha:create:register:${account}`,
    `account-verification:captcha:consume:register:${account}`,
    `account-verification:password:create:login:${account}`,
    `account-verification:password:consume:login:${account}`
  ];

  beforeEach(async () => {
    await getGlobalRedisConnection().del(...keys);
  });

  it.each([
    ['captcha create', assertCaptchaVerificationCreateFrequency, { account, scene: 'register' }],
    ['captcha consume', assertCaptchaVerificationConsumeFrequency, { account, scene: 'register' }],
    [
      'password create',
      assertPasswordVerificationCreateFrequency,
      { account, scene: 'login', seconds: 120 }
    ],
    [
      'password consume',
      assertPasswordVerificationConsumeFrequency,
      { account, scene: 'login', seconds: 120 }
    ]
  ] as const)('limits %s to 10 attempts', async (_name, assertFrequency, params) => {
    for (let index = 0; index < 10; index++) {
      await expect(assertFrequency(params)).resolves.toBeUndefined();
    }

    await expect(assertFrequency(params)).rejects.toThrow(UserErrEnum.verifyCodeTooFrequently);
  });

  it('keeps captcha and password actions independent', async () => {
    for (let index = 0; index < 10; index++) {
      await assertCaptchaVerificationCreateFrequency({ account, scene: 'register' });
    }

    await expect(
      assertCaptchaVerificationConsumeFrequency({ account, scene: 'register' })
    ).resolves.toBeUndefined();
    await expect(
      assertPasswordVerificationCreateFrequency({ account, scene: 'login', seconds: 120 })
    ).resolves.toBeUndefined();
    await expect(
      assertPasswordVerificationConsumeFrequency({ account, scene: 'login', seconds: 120 })
    ).resolves.toBeUndefined();
  });

  it('uses the configured window for password actions', async () => {
    await assertPasswordVerificationCreateFrequency({ account, scene: 'login', seconds: 17 });

    const ttl = await getGlobalRedisConnection().ttl(
      `account-verification:password:create:login:${account}`
    );
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(17);
  });
});
