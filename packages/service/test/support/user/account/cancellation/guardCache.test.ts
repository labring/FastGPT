import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { AccountCancellationCache } from '@fastgpt/dal/redis/caches';
import { Types } from '@fastgpt/service/common/mongo';
import { assertCancellation } from '@fastgpt/service/support/user/account/cancellation/guard';
import { MongoAccountCancellation } from '@fastgpt/service/support/user/account/cancellation/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

describe('assertCancellation Redis cache path', () => {
  let cacheGet: ReturnType<typeof vi.spyOn>;
  let cacheSet: ReturnType<typeof vi.spyOn>;
  let cacheSetIfAbsent: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await Promise.all([MongoAccountCancellation.deleteMany({}), MongoTeam.deleteMany({})]);

    vi.restoreAllMocks();
    cacheGet = vi.spyOn(AccountCancellationCache.prototype, 'get').mockResolvedValue(undefined);
    cacheSet = vi.spyOn(AccountCancellationCache.prototype, 'set').mockResolvedValue(undefined);
    cacheSetIfAbsent = vi
      .spyOn(AccountCancellationCache.prototype, 'setIfAbsent')
      .mockResolvedValue(true);
  });

  it('falls back to Mongo on an active team cache hit and rejects', async () => {
    const ownerId = new Types.ObjectId();
    const team = await MongoTeam.create({
      name: 'Active team cache team',
      ownerId
    });
    await MongoAccountCancellation.create({
      userId: ownerId,
      status: 'pending',
      requestedAt: new Date()
    });
    cacheGet.mockImplementation(async (scope: 'team' | 'user') => scope === 'team');
    const teamFindById = vi.spyOn(MongoTeam, 'findById');

    await expect(assertCancellation({ teamId: String(team._id) })).rejects.toThrow(
      TeamErrEnum.accountCancellationPending
    );

    expect(teamFindById).toHaveBeenCalledWith(String(team._id), { ownerId: 1 });
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('falls back on miss and caches the verified inactive state', async () => {
    const userId = new Types.ObjectId();
    const team = await MongoTeam.create({
      name: 'Cache fallback team',
      ownerId: new Types.ObjectId()
    });
    await expect(
      assertCancellation({ teamId: String(team._id), userId: String(userId) })
    ).resolves.toBeUndefined();

    expect(cacheGet).toHaveBeenCalledWith('team', String(team._id));
    expect(cacheGet).toHaveBeenCalledWith('user', String(userId));
    expect(cacheSetIfAbsent).toHaveBeenNthCalledWith(1, 'team', String(team._id), false);
    expect(cacheSetIfAbsent).toHaveBeenNthCalledWith(2, 'user', String(userId), false);
  });

  it('uses the inactive user cache without querying cancellation records', async () => {
    const userId = new Types.ObjectId();
    const team = await MongoTeam.create({
      name: 'Inactive user cache team',
      ownerId: new Types.ObjectId()
    });
    cacheGet.mockResolvedValue(false);
    const cancellationFindOne = vi.spyOn(MongoAccountCancellation, 'findOne');

    await expect(
      assertCancellation({ teamId: String(team._id), userId: String(userId) })
    ).resolves.toBeUndefined();

    expect(cacheGet).toHaveBeenCalledWith('user', String(userId));
    expect(cancellationFindOne).not.toHaveBeenCalled();
  });

  it('falls back to Mongo on an active user cache hit and rejects', async () => {
    const userId = new Types.ObjectId();
    const team = await MongoTeam.create({
      name: 'Active user cache team',
      ownerId: new Types.ObjectId()
    });
    await MongoAccountCancellation.create({
      userId,
      status: 'pending',
      requestedAt: new Date()
    });
    cacheGet.mockImplementation(async (scope: 'team' | 'user') => scope === 'user');
    const cancellationFindOne = vi.spyOn(MongoAccountCancellation, 'findOne');

    await expect(
      assertCancellation({ teamId: String(team._id), userId: String(userId) })
    ).rejects.toThrow(UserErrEnum.accountCancellationPending);

    expect(cacheGet).toHaveBeenCalledWith('user', String(userId));
    expect(cancellationFindOne).toHaveBeenCalledWith({
      userId: String(userId),
      status: { $in: ['pending', 'finalizing'] }
    });
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('caches an active member result before rejecting', async () => {
    const userId = new Types.ObjectId();
    const team = await MongoTeam.create({
      name: 'Active member cancellation team',
      ownerId: new Types.ObjectId()
    });
    await MongoAccountCancellation.create({
      userId,
      status: 'pending',
      requestedAt: new Date()
    });

    await expect(
      assertCancellation({ teamId: String(team._id), userId: String(userId) })
    ).rejects.toThrow(UserErrEnum.accountCancellationPending);

    expect(cacheSetIfAbsent).toHaveBeenNthCalledWith(1, 'team', String(team._id), false);
    expect(cacheSetIfAbsent).toHaveBeenNthCalledWith(2, 'user', String(userId), true);
  });

  it('does not overwrite an active cache marker when Mongo no longer has a record', async () => {
    const userId = new Types.ObjectId();
    const team = await MongoTeam.create({
      name: 'Stale active cache team',
      ownerId: new Types.ObjectId()
    });
    cacheGet.mockImplementation(async (scope: 'team' | 'user') => scope === 'user');

    await expect(
      assertCancellation({ teamId: String(team._id), userId: String(userId) })
    ).resolves.toBeUndefined();

    expect(cacheSetIfAbsent).not.toHaveBeenCalled();
    expect(cacheSet).not.toHaveBeenCalled();
  });
});
