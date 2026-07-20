import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertCodeVerificationConsumeFrequency,
  buildVerificationCodeFilter,
  escapeVerificationCodeForRegExp
} from '@fastgpt/service/support/user/account/verification/utils';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';

describe('escapeVerificationCodeForRegExp', () => {
  it('escapes every regular expression metacharacter', () => {
    expect(escapeVerificationCodeForRegExp('.*+?^${}()|[]\\')).toBe(
      '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\'
    );
  });
});

describe('buildVerificationCodeFilter', () => {
  it('uses an exact string for case-sensitive codes', () => {
    expect(buildVerificationCodeFilter({ code: '123456' })).toBe('123456');
  });

  it('builds an escaped and anchored filter for legacy case-insensitive codes', () => {
    const filter = buildVerificationCodeFilter({ code: 'a.b[c]', caseInsensitive: true });
    expect(filter.$regex.test('A.B[C]')).toBe(true);
    expect(filter.$regex.test('xa.b[c]')).toBe(false);
  });
});

describe('assertCodeVerificationConsumeFrequency', () => {
  const account = 'verification-rate-limit@example.com';

  beforeEach(async () => {
    await getGlobalRedisConnection().del(
      `account-verification:code:consume:register:${account}`,
      `account-verification:code:consume:findPassword:${account}`,
      'account-verification:code:consume:register:other@example.com'
    );
  });

  it('allows 10 attempts per account and scene, then returns the frequency error', async () => {
    const params = { account, scene: 'register' };

    for (let index = 0; index < 10; index++) {
      await expect(assertCodeVerificationConsumeFrequency(params)).resolves.toBeUndefined();
    }

    await expect(assertCodeVerificationConsumeFrequency(params)).rejects.toThrow(
      UserErrEnum.verifyCodeTooFrequently
    );
  });

  it('counts accounts and scenes independently', async () => {
    const registerParams = { account, scene: 'register' };

    for (let index = 0; index < 10; index++) {
      await assertCodeVerificationConsumeFrequency(registerParams);
    }

    await expect(
      assertCodeVerificationConsumeFrequency({
        account: 'other@example.com',
        scene: 'register'
      })
    ).resolves.toBeUndefined();
    await expect(
      assertCodeVerificationConsumeFrequency({
        account,
        scene: 'findPassword'
      })
    ).resolves.toBeUndefined();
  });
});
