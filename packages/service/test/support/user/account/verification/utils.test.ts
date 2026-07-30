import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';
import { describe, expect, it, beforeEach } from 'vitest';
import { assertCodeVerificationConsumeFrequency } from '@fastgpt/service/support/user/account/verification/utils';

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
