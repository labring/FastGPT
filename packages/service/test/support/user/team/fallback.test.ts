import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountCancellationStatus } from '@fastgpt/global/support/user/account/cancellation/constants';
import { MongoAccountCancellation } from '@fastgpt/service/support/user/account/cancellation/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { getUserFallbackTeam } from '@fastgpt/service/support/user/team/fallback';
import { getActiveAccountCancellationsByTeams } from '@fastgpt/service/support/user/account/cancellation/read';
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

    await expect(getUserFallbackTeam({ userId: String(userId) })).resolves.toEqual({
      teamId: String(ownerTeam._id),
      tmbId: String(ownerMember._id)
    });

    expect(memberFindSpy).not.toHaveBeenCalled();
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

describe('getActiveAccountCancellationsByTeams', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([
      MongoAccountCancellation.deleteMany({}),
      MongoTeamMember.deleteMany({}),
      MongoTeam.deleteMany({})
    ]);
  });

  it('reuses known owner cancellations and maps records back to every matching team', async () => {
    const knownOwnerId = new Types.ObjectId();
    const queriedOwnerId = new Types.ObjectId();
    const [knownTeam, queriedTeam] = await MongoTeam.create([
      { name: 'Known owner team', ownerId: knownOwnerId },
      { name: 'Queried owner team', ownerId: queriedOwnerId }
    ]);
    const queriedRecord = await MongoAccountCancellation.create({
      userId: queriedOwnerId,
      status: AccountCancellationStatus.pending,
      requestedAt: new Date()
    });
    const findSpy = vi.spyOn(MongoAccountCancellation, 'find');

    const result = await getActiveAccountCancellationsByTeams(
      [knownTeam, queriedTeam],
      [
        {
          userId: knownOwnerId,
          status: AccountCancellationStatus.finalizing,
          requestedAt: new Date()
        }
      ]
    );

    expect(findSpy).toHaveBeenCalledTimes(1);
    expect(findSpy.mock.calls[0][0]).toMatchObject({
      userId: { $in: [String(queriedOwnerId)] },
      status: { $in: ['pending', 'finalizing'] }
    });
    expect(result).toHaveLength(2);
    expect(result.map(({ teamId }) => teamId)).toEqual([
      String(knownTeam._id),
      String(queriedTeam._id)
    ]);
    expect(result[1].record).toMatchObject({
      status: AccountCancellationStatus.pending
    });
    expect(String(result[1].record._id)).toBe(String(queriedRecord._id));
    expect(String(result[1].record.userId)).toBe(String(queriedOwnerId));
  });

  it('returns without querying when teams are empty or have no owners', async () => {
    const findSpy = vi.spyOn(MongoAccountCancellation, 'find');

    await expect(getActiveAccountCancellationsByTeams([])).resolves.toEqual([]);
    await expect(
      getActiveAccountCancellationsByTeams([{ _id: 'team-1' }, { _id: 'team-2', ownerId: null }])
    ).resolves.toEqual([]);

    expect(findSpy).not.toHaveBeenCalled();
  });

  it('queries each owner once when multiple teams share an owner', async () => {
    const ownerId = new Types.ObjectId();
    const teams = [
      { _id: 'team-1', ownerId },
      { _id: 'team-2', ownerId: String(ownerId) }
    ];
    const findSpy = vi.spyOn(MongoAccountCancellation, 'find').mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([
          { userId: ownerId, status: AccountCancellationStatus.pending, requestedAt: new Date() }
        ])
    } as any);

    await expect(getActiveAccountCancellationsByTeams(teams)).resolves.toHaveLength(2);

    expect(findSpy).toHaveBeenCalledTimes(1);
    expect(findSpy.mock.calls[0][0]).toMatchObject({ userId: { $in: [String(ownerId)] } });
  });

  it('skips the query when known records cover all owners, including unrelated owners', async () => {
    const ownerId = new Types.ObjectId();
    const findSpy = vi.spyOn(MongoAccountCancellation, 'find');

    await expect(
      getActiveAccountCancellationsByTeams(
        [{ _id: 'team-1', ownerId }],
        [
          { userId: ownerId, status: AccountCancellationStatus.pending, requestedAt: new Date() },
          {
            userId: new Types.ObjectId(),
            status: AccountCancellationStatus.pending,
            requestedAt: new Date()
          }
        ]
      )
    ).resolves.toHaveLength(1);

    expect(findSpy).not.toHaveBeenCalled();
  });

  it.each([AccountCancellationStatus.pending, AccountCancellationStatus.finalizing])(
    'returns matching %s cancellation and ignores unrelated known owners',
    async (status) => {
      const ownerId = new Types.ObjectId();
      const unrelatedOwnerId = new Types.ObjectId();
      const findSpy = vi.spyOn(MongoAccountCancellation, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ userId: ownerId, status, requestedAt: new Date() }])
      } as any);

      const result = await getActiveAccountCancellationsByTeams(
        [{ _id: 'team-1', ownerId }],
        [{ userId: unrelatedOwnerId, status, requestedAt: new Date() }]
      );

      expect(findSpy).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ teamId: 'team-1', record: { userId: ownerId, status } });
    }
  );

  it('returns an empty array when queried owners have no active cancellation', async () => {
    const findSpy = vi.spyOn(MongoAccountCancellation, 'find').mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    } as any);

    await expect(
      getActiveAccountCancellationsByTeams([{ _id: 'team-1', ownerId: new Types.ObjectId() }])
    ).resolves.toEqual([]);
    expect(findSpy).toHaveBeenCalledTimes(1);
  });
});
