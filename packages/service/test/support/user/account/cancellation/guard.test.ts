import { beforeEach, describe, expect, it } from 'vitest';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { AccountCancellationStatus } from '@fastgpt/global/support/user/account/cancellation/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { assertCancellation } from '@fastgpt/service/support/user/account/cancellation/guard';
import { MongoAccountCancellation } from '@fastgpt/service/support/user/account/cancellation/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

describe('assertCancellation', () => {
  beforeEach(async () => {
    await Promise.all([
      MongoAccountCancellation.deleteMany({}),
      MongoTeamMember.deleteMany({}),
      MongoTeam.deleteMany({})
    ]);
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
      const member = await MongoTeamMember.create({
        teamId: team._id,
        userId,
        name: 'Member',
        status: 'active'
      });
      await MongoAccountCancellation.create({ userId, status, requestedAt: new Date() });

      await expect(
        assertCancellation({ teamId: String(team._id), tmbId: String(member._id) })
      ).rejects.toThrow(UserErrEnum.accountCancellationPending);
    }
  );

  it('rejects an unknown member and allows a member without cancellation', async () => {
    const team = await MongoTeam.create({ name: 'Usable team', ownerId: new Types.ObjectId() });

    await expect(
      assertCancellation({ teamId: String(team._id), tmbId: new Types.ObjectId().toString() })
    ).rejects.toThrow(ERROR_ENUM.unAuthorization);

    const member = await MongoTeamMember.create({
      teamId: team._id,
      userId: new Types.ObjectId(),
      name: 'Member',
      status: 'active'
    });
    await expect(
      assertCancellation({ teamId: String(team._id), tmbId: String(member._id) })
    ).resolves.toBeUndefined();
  });
});
