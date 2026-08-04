import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { AccountCancellationStatusEnum } from '@fastgpt/global/support/user/account/cancellation/constants';
import { resolveAccountCancellationAccess } from '@fastgpt/service/support/user/account/cancellation/access';
import { Types } from '@fastgpt/service/common/mongo';
import { assertAccountUsable } from '@fastgpt/service/support/user/account/cancellation/guard';
import { MongoAccountCancellation } from '@fastgpt/service/support/user/account/cancellation/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

describe('assertAccountUsable', () => {
  beforeEach(async () => {
    await Promise.all([
      MongoAccountCancellation.deleteMany({}),
      MongoTeamMember.deleteMany({}),
      MongoTeam.deleteMany({})
    ]);
  });

  it('resolves the actual API Key member from tmbId when teamId is already present', async () => {
    const userId = new Types.ObjectId();
    const [team] = await MongoTeam.create([
      {
        name: 'API Key cancellation team',
        ownerId: new Types.ObjectId()
      }
    ]);
    const [member] = await MongoTeamMember.create([
      {
        teamId: team._id,
        userId,
        name: 'Member',
        status: 'active'
      }
    ]);
    await MongoAccountCancellation.create([
      {
        userId,
        status: AccountCancellationStatusEnum.pending,
        requestedAt: new Date()
      }
    ]);

    await expect(
      assertAccountUsable({
        teamId: String(team._id),
        tmbId: String(member._id)
      })
    ).rejects.toThrow(UserErrEnum.accountCancellationPending);
  });

  it.each([AccountCancellationStatusEnum.pending, AccountCancellationStatusEnum.finalizing])(
    'blocks the current user %s cancellation under normal access',
    async (status) => {
      const userId = new Types.ObjectId();
      const ownerId = new Types.ObjectId();
      const context = {
        userId: String(userId),
        teamId: new Types.ObjectId().toString(),
        tmbId: new Types.ObjectId().toString(),
        ownerId: String(ownerId)
      };

      await expect(
        assertAccountUsable({
          authContext: context,
          cancellations: [{ userId, status }]
        })
      ).rejects.toThrow(UserErrEnum.accountCancellationPending);
    }
  );

  it('allows pending recovery but never allows finalizing recovery through the pending flag', async () => {
    const userId = new Types.ObjectId();
    const context = {
      userId: String(userId),
      teamId: new Types.ObjectId().toString(),
      tmbId: new Types.ObjectId().toString()
    };

    await expect(
      assertAccountUsable({
        authContext: context,
        cancellations: [{ userId, status: AccountCancellationStatusEnum.pending }],
        allowUserAccountCancellationPending: true
      })
    ).resolves.toBeUndefined();
    await expect(
      assertAccountUsable({
        authContext: context,
        cancellations: [{ userId, status: AccountCancellationStatusEnum.finalizing }],
        allowUserAccountCancellationPending: true
      })
    ).rejects.toThrow(UserErrEnum.accountCancellationPending);
  });

  it('applies tokenLogin flags independently to user and owner-team cancellation states', async () => {
    const userId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    const context = {
      userId: String(userId),
      teamId: new Types.ObjectId().toString(),
      tmbId: new Types.ObjectId().toString(),
      ownerId: String(ownerId)
    };
    const tokenLoginOptions = resolveAccountCancellationAccess({
      req: { method: 'GET', url: '/api/support/user/account/login/tokenLogin' },
      accountCancellationAccess: 'tokenLogin'
    });

    await expect(
      assertAccountUsable({
        authContext: context,
        cancellations: [{ userId, status: AccountCancellationStatusEnum.pending }],
        ...tokenLoginOptions
      })
    ).resolves.toBeUndefined();
    await expect(
      assertAccountUsable({
        authContext: context,
        cancellations: [{ userId, status: AccountCancellationStatusEnum.finalizing }],
        ...tokenLoginOptions
      })
    ).rejects.toThrow(UserErrEnum.accountCancellationPending);
    for (const status of [
      AccountCancellationStatusEnum.pending,
      AccountCancellationStatusEnum.finalizing
    ]) {
      await expect(
        assertAccountUsable({
          authContext: context,
          cancellations: [{ userId: ownerId, status }],
          ...tokenLoginOptions
        })
      ).resolves.toBeUndefined();
    }
  });

  it.each([AccountCancellationStatusEnum.pending, AccountCancellationStatusEnum.finalizing])(
    'allows a member to inspect another owner cancellation through team escape: %s',
    async (status) => {
      const ownerId = new Types.ObjectId();
      const context = {
        userId: new Types.ObjectId().toString(),
        teamId: new Types.ObjectId().toString(),
        tmbId: new Types.ObjectId().toString(),
        ownerId: String(ownerId)
      };

      await expect(
        assertAccountUsable({
          authContext: context,
          cancellations: [{ userId: ownerId, status }],
          allowCurrentSessionTeamAccountCancellationPending: status === 'pending',
          allowCurrentSessionTeamAccountCancellationFinalizing: status === 'finalizing'
        })
      ).resolves.toBeUndefined();
    }
  );

  it('uses one auth-context aggregation and one cancellation query on the normal path', async () => {
    const userId = new Types.ObjectId();
    const [team] = await MongoTeam.create([
      { name: 'Query count team', ownerId: new Types.ObjectId() }
    ]);
    const [member] = await MongoTeamMember.create([
      {
        teamId: team._id,
        userId,
        name: 'Member',
        status: 'active'
      }
    ]);
    const aggregateSpy = vi.spyOn(MongoTeamMember, 'aggregate');
    const cancellationFindSpy = vi.spyOn(MongoAccountCancellation, 'find');

    await assertAccountUsable({
      userId: String(userId),
      teamId: String(team._id),
      tmbId: String(member._id)
    });

    expect(aggregateSpy).toHaveBeenCalledTimes(1);
    expect(cancellationFindSpy).toHaveBeenCalledTimes(1);
    const [query] = cancellationFindSpy.mock.calls[0];
    expect(query).toMatchObject({ status: { $in: ['pending', 'finalizing'] } });
    aggregateSpy.mockRestore();
    cancellationFindSpy.mockRestore();
  });
});
