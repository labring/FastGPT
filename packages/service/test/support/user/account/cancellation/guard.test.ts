import { beforeEach, describe, expect, it } from 'vitest';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { AccountCancellationStatus } from '@fastgpt/global/support/user/account/cancellation/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { assertCancellation } from '@fastgpt/service/support/user/account/cancellation/guard';
import { MongoAccountCancellation } from '@fastgpt/service/support/user/account/cancellation/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

describe('assertCancellation', () => {
  beforeEach(async () => {
    await Promise.all([MongoAccountCancellation.deleteMany({}), MongoTeam.deleteMany({})]);
  });

  it.each([AccountCancellationStatus.pending, AccountCancellationStatus.finalizing])(
    'blocks a team whose owner cancellation is %s',
    async (status) => {
      const ownerId = new Types.ObjectId();
      const team = await MongoTeam.create({ name: 'Cancelling team', ownerId });
      await MongoAccountCancellation.create({ userId: ownerId, status, requestedAt: new Date() });

      await expect(assertCancellation({ teamId: String(team._id) })).rejects.toThrow(
        TeamErrEnum.accountCancellationPending
      );
    }
  );

  it.each([AccountCancellationStatus.pending, AccountCancellationStatus.finalizing])(
    'blocks a member whose user cancellation is %s',
    async (status) => {
      const userId = new Types.ObjectId();
      const team = await MongoTeam.create({
        name: 'Member cancellation team',
        ownerId: new Types.ObjectId()
      });
      await MongoAccountCancellation.create({ userId, status, requestedAt: new Date() });

      await expect(
        assertCancellation({ teamId: String(team._id), userId: String(userId) })
      ).rejects.toThrow(UserErrEnum.accountCancellationPending);
    }
  );

  it('allows a user without cancellation', async () => {
    const team = await MongoTeam.create({ name: 'Usable team', ownerId: new Types.ObjectId() });

    const userId = new Types.ObjectId();
    await expect(
      assertCancellation({ teamId: String(team._id), userId: String(userId) })
    ).resolves.toBeUndefined();
  });
});
