import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { AccountCancellationCache } from '@fastgpt/dal/redis/caches';
import { Types } from '@fastgpt/service/common/mongo';
import { assertCancellation } from '@fastgpt/service/support/user/account/cancellation/guard';
import { MongoAccountCancellation } from '@fastgpt/service/support/user/account/cancellation/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

describe('assertCancellation Redis cache path', () => {
  let cacheGet: ReturnType<typeof vi.spyOn>;
  let cacheSet: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await Promise.all([
      MongoAccountCancellation.deleteMany({}),
      MongoTeamMember.deleteMany({}),
      MongoTeam.deleteMany({})
    ]);

    vi.restoreAllMocks();
    cacheGet = vi.spyOn(AccountCancellationCache.prototype, 'get').mockResolvedValue(undefined);
    cacheSet = vi.spyOn(AccountCancellationCache.prototype, 'set').mockResolvedValue(undefined);
  });

  it('rejects from an active team cache hit without querying Mongo', async () => {
    const teamId = new Types.ObjectId().toString();
    const tmbId = new Types.ObjectId().toString();
    cacheGet.mockImplementation(async (scope: 'team' | 'member') => scope === 'team');
    const teamFindById = vi.spyOn(MongoTeam, 'findById');
    const memberFindById = vi.spyOn(MongoTeamMember, 'findById');

    await expect(assertCancellation({ teamId, tmbId })).rejects.toThrow(
      TeamErrEnum.accountCancellationPending
    );

    expect(teamFindById).not.toHaveBeenCalled();
    expect(memberFindById).not.toHaveBeenCalled();
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('falls back on miss and caches the verified inactive state', async () => {
    const team = await MongoTeam.create({
      name: 'Cache fallback team',
      ownerId: new Types.ObjectId()
    });
    const member = await MongoTeamMember.create({
      teamId: team._id,
      userId: new Types.ObjectId(),
      name: 'Member',
      status: 'active'
    });

    await expect(
      assertCancellation({ teamId: String(team._id), tmbId: String(member._id) })
    ).resolves.toBeUndefined();

    expect(cacheGet).toHaveBeenCalledWith('team', String(team._id));
    expect(cacheGet).toHaveBeenCalledWith('member', String(member._id));
    expect(cacheSet).toHaveBeenNthCalledWith(1, 'team', String(team._id), false);
    expect(cacheSet).toHaveBeenNthCalledWith(2, 'member', String(member._id), false);
  });

  it('caches an active member result before rejecting', async () => {
    const userId = new Types.ObjectId();
    const team = await MongoTeam.create({
      name: 'Active member cancellation team',
      ownerId: new Types.ObjectId()
    });
    const member = await MongoTeamMember.create({
      teamId: team._id,
      userId,
      name: 'Member',
      status: 'active'
    });
    await MongoAccountCancellation.create({
      userId,
      status: 'pending',
      requestedAt: new Date()
    });

    await expect(
      assertCancellation({ teamId: String(team._id), tmbId: String(member._id) })
    ).rejects.toThrow(UserErrEnum.accountCancellationPending);

    expect(cacheSet).toHaveBeenNthCalledWith(1, 'team', String(team._id), false);
    expect(cacheSet).toHaveBeenNthCalledWith(2, 'member', String(member._id), true);
  });
});
