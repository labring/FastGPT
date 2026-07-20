import { beforeEach, describe, expect, it } from 'vitest';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoAccountVerificationMaterial } from '@fastgpt/service/support/user/account/verification/schema';
import { PasswordAccountVerification } from '@fastgpt/service/support/user/account/verification/password/service';

describe('PasswordAccountVerification', () => {
  beforeEach(async () => {
    await MongoAccountVerificationMaterial.deleteMany({});
  });

  it('creates a deterministic 30-second pre-login material', async () => {
    const now = new Date('2026-07-14T00:00:00.000Z');
    const verification = new PasswordAccountVerification({
      generateCode: () => 'ABC123',
      now: () => now
    });

    await expect(verification.create({ username: 'user' })).resolves.toEqual({ code: 'ABC123' });
    await expect(
      MongoAccountVerificationMaterial.findOne({ key: 'user' }).lean()
    ).resolves.toMatchObject({
      code: 'ABC123',
      createTime: now,
      expiredTime: new Date('2026-07-14T00:00:30.000Z')
    });
  });

  it('consumes the code and returns a local identity for a third-party username', async () => {
    await MongoUser.create({
      username: 'git-user',
      password: 'password',
      status: UserStatusEnum.active
    });
    const verification = new PasswordAccountVerification({ generateCode: () => 'ABC123' });
    await verification.create({ username: 'git-user' });

    await expect(
      verification.consume({ username: 'git-user', password: 'password', code: 'abc123' })
    ).resolves.toMatchObject({
      kind: 'local',
      username: 'git-user',
      isRoot: false
    });
    await expect(
      verification.consume({ username: 'git-user', password: 'password', code: 'ABC123' })
    ).rejects.toThrow(UserErrEnum.invalidVerificationCode);
  });

  it('uses one account error for an unknown user or wrong password', async () => {
    const verification = new PasswordAccountVerification({ generateCode: () => 'ABC123' });
    await verification.create({ username: 'missing' });
    await expect(
      verification.consume({ username: 'missing', password: 'password', code: 'ABC123' })
    ).rejects.toBe(UserErrEnum.account_psw_error);

    await MongoUser.create({
      username: 'user',
      password: 'password',
      status: UserStatusEnum.active
    });
    await verification.create({ username: 'user' });
    await expect(
      verification.consume({ username: 'user', password: 'wrong', code: 'ABC123' })
    ).rejects.toBe(UserErrEnum.account_psw_error);
  });

  it('rejects forbidden users after consuming their code', async () => {
    await MongoUser.create({
      username: 'user',
      password: 'password',
      status: UserStatusEnum.forbidden
    });
    const verification = new PasswordAccountVerification({ generateCode: () => 'ABC123' });
    await verification.create({ username: 'user' });

    await expect(
      verification.consume({ username: 'user', password: 'password', code: 'ABC123' })
    ).rejects.toBe('Invalid account!');
  });
});
