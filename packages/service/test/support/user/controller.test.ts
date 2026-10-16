import { describe, expect, it, vi } from 'vitest';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';

// 本测试需要真实的 mongoSessionRun 来跑事务，其余测试文件对它的全局 mock 在这里要被撤销。
vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

describe('getUserDetail mustChangePassword', () => {
  const setupUser = async ({
    username,
    mustChangePassword
  }: {
    username: string;
    mustChangePassword?: boolean;
  }) => {
    const user = await MongoUser.create({
      username,
      password: 'password',
      ...(mustChangePassword === undefined ? {} : { mustChangePassword })
    });
    await mongoSessionRun((session) => createDefaultTeam({ userId: String(user._id), session }));
    return user;
  };

  it('returns true when the flag is set', async () => {
    const user = await setupUser({ username: 'detail-flag-on', mustChangePassword: true });

    const detail = await getUserDetail({ userId: String(user._id) });

    expect(detail.mustChangePassword).toBe(true);
  });

  it('returns false when the flag is absent or false', async () => {
    const userWithoutFlag = await setupUser({ username: 'detail-flag-absent' });
    const userWithFalse = await setupUser({
      username: 'detail-flag-off',
      mustChangePassword: false
    });

    expect((await getUserDetail({ userId: String(userWithoutFlag._id) })).mustChangePassword).toBe(
      false
    );
    expect((await getUserDetail({ userId: String(userWithFalse._id) })).mustChangePassword).toBe(
      false
    );
  });
});
