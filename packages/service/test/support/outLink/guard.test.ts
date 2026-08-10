import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertAccountUsable: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@fastgpt/service/support/user/account/cancellation/guard', () => ({
  assertAccountUsable: mocks.assertAccountUsable
}));

import { assertOutLinkTeamUsable } from '@fastgpt/service/support/outLink/guard';

describe('assertOutLinkTeamUsable', () => {
  it('checks the team and member bound to the published link', async () => {
    await assertOutLinkTeamUsable({ teamId: 'team-1', tmbId: 'member-1' });

    expect(mocks.assertAccountUsable).toHaveBeenCalledWith({
      teamId: 'team-1',
      tmbId: 'member-1'
    });
  });
});
