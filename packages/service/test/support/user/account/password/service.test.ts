import { describe, expect, it } from 'vitest';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import {
  PASSWORD_CHANGE_SESSION_TTL_SECONDS,
  consumePasswordChangeSessionInTransaction,
  createPasswordChangeSession
} from '@fastgpt/service/support/user/account/password/service';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';

describe('password change session service', () => {
  it('creates a short-lived session bound to the user and login session', async () => {
    const result = await createPasswordChangeSession({
      userId: 'user-1',
      loginSessionId: 'login-1'
    });
    const record = await MongoTmpData.findOne({
      data: { userId: 'user-1', loginSessionId: 'login-1' }
    }).lean();

    expect(result.sessionId).toHaveLength(43);
    expect(new Date(result.expiredAt).getTime()).toBeGreaterThan(Date.now());
    expect(record).toMatchObject({ data: { userId: 'user-1', loginSessionId: 'login-1' } });
    expect(PASSWORD_CHANGE_SESSION_TTL_SECONDS).toBe(300);
  });

  it('rejects a missing, expired, mismatched, or reused session', async () => {
    await expect(
      consumePasswordChangeSessionInTransaction({
        sessionId: 'missing',
        userId: 'user-1',
        loginSessionId: 'login-1',
        newPassword: 'new',
        handler: async () => undefined
      })
    ).rejects.toThrow(UserErrEnum.passwordChangeAuthorizationInvalid);
  });
});
