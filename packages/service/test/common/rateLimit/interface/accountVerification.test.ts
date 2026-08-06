import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import {
  createRedisLogicalKey,
  getRedisRuntime,
  toPhysicalRedisKey
} from '@fastgpt/dal/redis/runtime';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  assertCaptchaVerificationConsumeRateLimit,
  assertCaptchaVerificationCreateRateLimit,
  assertCodeVerificationConsumeRateLimit,
  assertPasswordVerificationCreateRateLimit,
  assertPasswordVerificationConsumeRateLimit
} from '@fastgpt/service/common/rateLimit/interface/accountVerification';
import { RATE_LIMIT_KEY_PREFIX } from '@fastgpt/service/common/rateLimit/core';

const getVerificationFrequencyLimitKey = (...segments: string[]) =>
  toPhysicalRedisKey(
    createRedisLogicalKey({
      namespace: RATE_LIMIT_KEY_PREFIX,
      segments: ['account-verification', ...segments]
    })
  );

const getRedisConnection = () => getRedisRuntime().getCommandConnection();

describe('assertCodeVerificationConsumeFrequency', () => {
  const account = 'verification-rate-limit@example.com';
  const key = getVerificationFrequencyLimitKey('code-consume', 'register', 'account', account);

  beforeEach(async () => {
    await getRedisConnection().del(key);
  });

  it('allows 10 attempts and rejects the 11th attempt', async () => {
    const params = { account, scene: 'register' };

    for (let index = 0; index < 10; index++) {
      await expect(assertCodeVerificationConsumeRateLimit(params)).resolves.toBeUndefined();
    }

    await expect(assertCodeVerificationConsumeRateLimit(params)).rejects.toThrow(
      UserErrEnum.verifyCodeTooFrequently
    );
  });

  it('keeps accounts and scenes independent', async () => {
    const params = { account, scene: 'register' };
    for (let index = 0; index < 10; index++) {
      await assertCodeVerificationConsumeRateLimit(params);
    }

    await expect(
      assertCodeVerificationConsumeRateLimit({ account: 'other@example.com', scene: 'register' })
    ).resolves.toBeUndefined();
    await expect(
      assertCodeVerificationConsumeRateLimit({ account, scene: 'findPassword' })
    ).resolves.toBeUndefined();
  });
});

describe('account verification frequency actions', () => {
  const account = 'verification-actions@example.com';
  const keys = [
    getVerificationFrequencyLimitKey('captcha-create', 'register', 'account', account),
    getVerificationFrequencyLimitKey('captcha-consume', 'register', 'account', account),
    getVerificationFrequencyLimitKey('password-create', 'login', 'account', account),
    getVerificationFrequencyLimitKey('password-consume', 'login', 'account', account)
  ];

  beforeEach(async () => {
    await getRedisConnection().del(...keys);
  });

  it.each([
    ['captcha create', assertCaptchaVerificationCreateRateLimit, { account, scene: 'register' }],
    ['captcha consume', assertCaptchaVerificationConsumeRateLimit, { account, scene: 'register' }],
    [
      'password create',
      assertPasswordVerificationCreateRateLimit,
      { account, scene: 'login', limit: 10 }
    ],
    [
      'password consume',
      assertPasswordVerificationConsumeRateLimit,
      { account, scene: 'login', limit: 10 }
    ]
  ] as const)('limits %s to 10 attempts', async (_name, assertFrequency, params) => {
    for (let index = 0; index < 10; index++) {
      await expect(assertFrequency(params)).resolves.toBeUndefined();
    }

    await expect(assertFrequency(params)).rejects.toThrow(UserErrEnum.verifyCodeTooFrequently);
  });

  it('keeps captcha and password actions independent', async () => {
    for (let index = 0; index < 10; index++) {
      await assertCaptchaVerificationCreateRateLimit({ account, scene: 'register' });
    }

    await expect(
      assertCaptchaVerificationConsumeRateLimit({ account, scene: 'register' })
    ).resolves.toBeUndefined();
    await expect(
      assertPasswordVerificationCreateRateLimit({ account, scene: 'login', limit: 10 })
    ).resolves.toBeUndefined();
    await expect(
      assertPasswordVerificationConsumeRateLimit({ account, scene: 'login', limit: 10 })
    ).resolves.toBeUndefined();
  });

  it('uses the configured request limit with a fixed one-minute window', async () => {
    const params = { account, scene: 'login', limit: 1 } as const;

    await expect(assertPasswordVerificationCreateRateLimit(params)).resolves.toBeUndefined();
    await expect(assertPasswordVerificationCreateRateLimit(params)).rejects.toThrow(
      UserErrEnum.verifyCodeTooFrequently
    );

    const ttl = await getRedisConnection().ttl(
      getVerificationFrequencyLimitKey('password-create', 'login', 'account', account)
    );
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });
});
