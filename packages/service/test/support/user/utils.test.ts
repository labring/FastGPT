import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addSourceMember, clearWebSyncLimit } from '../../../support/user/utils';
import { MongoTeam } from '../../../support/user/team/teamSchema';
import { MongoUser } from '../../../support/user/schema';
import { getTeamMemberMap } from '../../../support/user/team/utils';

vi.mock('../../../support/user/team/teamSchema', () => ({
  MongoTeam: {
    findByIdAndUpdate: vi.fn()
  }
}));

vi.mock('../../../support/user/team/utils', () => ({
  getTeamMemberMap: vi.fn()
}));

vi.mock('../../../support/user/schema', () => ({
  MongoUser: {
    find: vi.fn()
  }
}));

describe('support user utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MongoUser.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    } as any);
  });

  it('clears website sync limit timestamp', async () => {
    const teamId = 'team-id';

    await clearWebSyncLimit(teamId);

    expect(MongoTeam.findByIdAndUpdate).toHaveBeenCalledWith(teamId, {
      $unset: {
        'limit.lastWebsiteSyncTime': 1
      }
    });
  });

  it.each([null, undefined, '', '   '])(
    'falls back to unknow when source member name is %j',
    async (name) => {
      vi.mocked(getTeamMemberMap).mockResolvedValue(
        new Map([
          [
            'member-id',
            {
              _id: 'member-id',
              userId: 'user-id',
              name,
              avatar: '',
              status: 'active'
            } as any
          ]
        ])
      );

      const [result] = await addSourceMember({
        list: [{ tmbId: 'member-id' }]
      });

      expect(result.sourceMember.name).toBe('unknown');
    }
  );

  it('preserves a non-empty source member name', async () => {
    vi.mocked(getTeamMemberMap).mockResolvedValue(
      new Map([
        [
          'member-id',
          {
            _id: 'member-id',
            userId: 'user-id',
            name: 'Member name',
            avatar: '',
            status: 'active'
          } as any
        ]
      ])
    );

    const [result] = await addSourceMember({
      list: [{ tmbId: 'member-id' }]
    });

    expect(result.sourceMember.name).toBe('Member name');
  });
});
