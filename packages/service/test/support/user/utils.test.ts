import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearWebSyncLimit } from '../../../support/user/utils';
import { MongoTeam } from '../../../support/user/team/teamSchema';

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
});
