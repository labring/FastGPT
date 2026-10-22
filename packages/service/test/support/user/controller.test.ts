import { describe, expect, it, vi } from 'vitest';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';

// 本测试需要真实的 mongoSessionRun 来跑事务，其余测试文件对它的全局 mock 在这里要被撤销。
vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

describe('getUserDetail isActivated', () => {
  const setupUser = async ({
    username,
    isActivated
  }: {
    username: string;
    isActivated?: boolean;
  }) => {
    const user = await MongoUser.create({
      username,
      password: 'password',
      ...(isActivated === undefined ? {} : { isActivated })
    });
    await mongoSessionRun((session) => createDefaultTeam({ userId: String(user._id), session }));
    return user;
  };

  it('returns false when the account is not activated', async () => {
    const user = await setupUser({ username: 'detail-unactivated', isActivated: false });

    const detail = await getUserDetail({ userId: String(user._id) });

    expect(detail.isActivated).toBe(false);
  });

  it('treats accounts without an activation value as activated', async () => {
    const userWithoutField = await setupUser({ username: 'detail-field-absent' });
    await MongoUser.updateOne({ _id: userWithoutField._id }, { $unset: { isActivated: 1 } });

    expect((await getUserDetail({ userId: String(userWithoutField._id) })).isActivated).toBe(true);
  });
});
