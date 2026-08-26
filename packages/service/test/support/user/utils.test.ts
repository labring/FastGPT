import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addSourceMember, clearWebSyncLimit } from '../../../support/user/utils';
import { MongoTeam } from '../../../support/user/team/teamSchema';
import { MongoTeamMember } from '../../../support/user/team/teamMemberSchema';

vi.mock('../../../support/user/team/teamSchema', () => ({
  MongoTeam: {
    findByIdAndUpdate: vi.fn()
  }
}));

vi.mock('../../../support/user/team/teamMemberSchema', () => ({
  MongoTeamMember: {
    find: vi.fn()
  }
}));

describe('support user utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      vi.mocked(MongoTeamMember.find).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: 'member-id',
            name,
            avatar: '',
            status: 'active'
          }
        ])
      } as any);

      const [result] = await addSourceMember({
        list: [{ tmbId: 'member-id' }]
      });

      expect(result.sourceMember.name).toBe('unknow');
    }
  );

  it('preserves a non-empty source member name', async () => {
    vi.mocked(MongoTeamMember.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'member-id',
          name: 'Member name',
          avatar: '',
          status: 'active'
        }
      ])
    } as any);

    const [result] = await addSourceMember({
      list: [{ tmbId: 'member-id' }]
    });

    expect(result.sourceMember.name).toBe('Member name');
  });
});
