import { describe, expect, it, vi } from 'vitest';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';

// 本测试需要真实的 mongoSessionRun 来跑事务，其余测试文件对它的全局 mock 在这里要被撤销。
vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

describe('getUserDetail status', () => {
  const setupUser = async ({ username, status }: { username: string; status?: UserStatusEnum }) => {
    const user = await MongoUser.create({
      username,
      password: 'password',
      ...(status === undefined ? {} : { status })
    });
    await mongoSessionRun((session) => createDefaultTeam({ userId: String(user._id), session }));
    return user;
  };

  it('returns inactive status when the account needs activation', async () => {
    const user = await setupUser({ username: 'detail-inactive', status: UserStatusEnum.inactive });

    const detail = await getUserDetail({ userId: String(user._id) });

    expect(detail.status).toBe(UserStatusEnum.inactive);
  });

  it('treats accounts without a persisted status as active', async () => {
    const userWithoutStatus = await setupUser({ username: 'detail-status-absent' });
    await MongoUser.updateOne({ _id: userWithoutStatus._id }, { $unset: { status: 1 } });

    expect((await getUserDetail({ userId: String(userWithoutStatus._id) })).status).toBe(
      UserStatusEnum.active
    );
  });
});
