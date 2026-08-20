import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearWebSyncLimit } from '../../../support/user/utils';
import { teamRepository } from '../../../common/dal';

vi.mock('../../../common/dal', () => ({
  teamRepository: {
    updateTeamLimit: vi.fn()
  }
}));

describe('support user utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears website sync limit timestamp', async () => {
    const teamId = 'team-id';

    await clearWebSyncLimit(teamId);

    expect(teamRepository.updateTeamLimit).toHaveBeenCalledWith(teamId, {
      lastWebsiteSyncTime: null
    });
  });
});
