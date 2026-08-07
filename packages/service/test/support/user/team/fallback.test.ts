import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountCancellationStatusEnum } from '@fastgpt/global/support/user/account/cancellation/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAccountCancellation } from '@fastgpt/service/support/user/account/cancellation/schema';
import { getUserFallbackTeam } from '@fastgpt/service/support/user/team/fallback';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

describe('getUserFallbackTeam', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([
      MongoAccountCancellation.deleteMany({}),
      MongoTeamMember.deleteMany({}),
      MongoTeam.deleteMany({})
    ]);
  });

  it('returns the active owner team without scanning all memberships', async () => {
    const userId = new Types.ObjectId();
    const [ownerTeam, joinedTeam] = await MongoTeam.create([
      { name: 'Owner team', ownerId: userId },
      { name: 'Joined team', ownerId: new Types.ObjectId() }
    ]);
    const [ownerMember] = await MongoTeamMember.create([
      { teamId: ownerTeam._id, userId, name: 'Owner', status: 'active' },
      { teamId: joinedTeam._id, userId, name: 'Member', status: 'active' }
    ]);
    const memberFindSpy = vi.spyOn(MongoTeamMember, 'find');
    const cancellationFindSpy = vi.spyOn(MongoAccountCancellation, 'findOne');

    await expect(getUserFallbackTeam({ userId: String(userId) })).resolves.toEqual({
      teamId: String(ownerTeam._id),
      tmbId: String(ownerMember._id)
    });

    expect(memberFindSpy).not.toHaveBeenCalled();
    expect(cancellationFindSpy).toHaveBeenCalledTimes(1);
  });

  it('skips the cancellation query when the caller explicitly allows the owner team', async () => {
    const userId = new Types.ObjectId();
    const [ownerTeam] = await MongoTeam.create([{ name: 'Owner team', ownerId: userId }]);
    const [ownerMember] = await MongoTeamMember.create([
      { teamId: ownerTeam._id, userId, name: 'Owner', status: 'active' }
    ]);
    await MongoAccountCancellation.create([
      {
        userId,
        status: AccountCancellationStatusEnum.pending,
        requestedAt: new Date()
      }
    ]);
    const cancellationFindSpy = vi.spyOn(MongoAccountCancellation, 'findOne');

    await expect(
      getUserFallbackTeam({
        userId: String(userId),
        allowAccountCancellationTeam: true
      })
    ).resolves.toEqual({
      teamId: String(ownerTeam._id),
      tmbId: String(ownerMember._id)
    });

    expect(cancellationFindSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['deleted', { deleteTime: new Date() }],
    ['excluded', {}]
  ])(
    'falls back to another active team when the owner team is %s',
    async (reason, ownerTeamData) => {
      const userId = new Types.ObjectId();
      const [ownerTeam, joinedTeam] = await MongoTeam.create([
        { name: 'Owner team', ownerId: userId, ...ownerTeamData },
        { name: 'Joined team', ownerId: new Types.ObjectId() }
      ]);
      const [, joinedMember] = await MongoTeamMember.create([
        { teamId: ownerTeam._id, userId, name: 'Owner', status: 'active' },
        { teamId: joinedTeam._id, userId, name: 'Member', status: 'active' }
      ]);

      await expect(
        getUserFallbackTeam({
          userId: String(userId),
          excludedTeamId: reason === 'excluded' ? String(ownerTeam._id) : undefined
        })
      ).resolves.toEqual({
        teamId: String(joinedTeam._id),
        tmbId: String(joinedMember._id)
      });
    }
  );

  it('falls back to another active team when the owner team is cancelling', async () => {
    const userId = new Types.ObjectId();
    const [ownerTeam, joinedTeam] = await MongoTeam.create([
      { name: 'Owner team', ownerId: userId },
      { name: 'Joined team', ownerId: new Types.ObjectId() }
    ]);
    const [, joinedMember] = await MongoTeamMember.create([
      { teamId: ownerTeam._id, userId, name: 'Owner', status: 'active' },
      { teamId: joinedTeam._id, userId, name: 'Member', status: 'active' }
    ]);
    await MongoAccountCancellation.create([
      {
        userId,
        status: AccountCancellationStatusEnum.pending,
        requestedAt: new Date()
      }
    ]);

    await expect(getUserFallbackTeam({ userId: String(userId) })).resolves.toEqual({
      teamId: String(joinedTeam._id),
      tmbId: String(joinedMember._id)
    });
  });

  it('falls back to another active team when the owner membership is inactive', async () => {
    const userId = new Types.ObjectId();
    const [ownerTeam, joinedTeam] = await MongoTeam.create([
      { name: 'Owner team', ownerId: userId },
      { name: 'Joined team', ownerId: new Types.ObjectId() }
    ]);
    const [, joinedMember] = await MongoTeamMember.create([
      { teamId: ownerTeam._id, userId, name: 'Owner', status: 'leave' },
      { teamId: joinedTeam._id, userId, name: 'Member', status: 'active' }
    ]);

    await expect(getUserFallbackTeam({ userId: String(userId) })).resolves.toEqual({
      teamId: String(joinedTeam._id),
      tmbId: String(joinedMember._id)
    });
  });

  it('returns null when the user has no usable team', async () => {
    await expect(
      getUserFallbackTeam({ userId: new Types.ObjectId().toString() })
    ).resolves.toBeNull();
  });
});
