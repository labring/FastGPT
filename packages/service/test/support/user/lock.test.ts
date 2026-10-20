import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaseCache } from '@fastgpt/dal/redis/caches';
import { withTeamLock } from '@fastgpt/service/support/user/lock';

describe('team lock', () => {
  let withLease: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    withLease = vi.spyOn(LeaseCache.prototype, 'withLease');
    withLease.mockImplementation(async ({ fn }) => fn({} as any));
  });

  it('holds a team-scoped lease around the callback and returns its result', async () => {
    const callback = vi.fn().mockResolvedValue('done');

    await expect(withTeamLock('team-1', callback)).resolves.toBe('done');

    expect(withLease).toHaveBeenCalledWith({
      key: 'team:team-1',
      label: 'team-operation',
      ttlMs: 600000,
      fn: expect.any(Function)
    });
    expect(callback).toHaveBeenCalledOnce();
  });
});
