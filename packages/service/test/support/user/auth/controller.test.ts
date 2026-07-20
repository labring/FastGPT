import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';
import { authCode } from '@fastgpt/service/support/user/auth/controller';

vi.unmock('@fastgpt/service/support/user/auth/controller');

describe('authCode', () => {
  const account = 'legacy-rate-limit@example.com';

  beforeEach(async () => {
    await getGlobalRedisConnection().del(
      `account-verification:code:consume:${UserAuthTypeEnum.bindNotification}:${account}`
    );
  });

  it('applies the shared account and scene frequency limit before legacy code validation', async () => {
    const params = {
      key: account,
      type: UserAuthTypeEnum.bindNotification,
      code: 'wrong-code'
    };

    for (let index = 0; index < 10; index++) {
      await authCode(params).catch(() => undefined);
    }

    await expect(authCode(params)).rejects.toThrow(UserErrEnum.verifyCodeTooFrequently);
  });
});
