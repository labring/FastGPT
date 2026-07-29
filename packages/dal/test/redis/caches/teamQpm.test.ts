import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamQpmCache } from '@fastgpt/dal/redis/caches';

describe('TeamQpmCache', () => {
  const redis = {
    delete: vi.fn(),
    get: vi.fn(),
    set: vi.fn()
  } as any;
  const cache = new TeamQpmCache({ redis });

  beforeEach(() => {
    vi.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue(undefined);
    redis.delete.mockResolvedValue(false);
  });

  it('reads a valid cached integer and preserves the logical key', async () => {
    redis.get.mockResolvedValue('120');

    await expect(cache.getCachedLimit('team-1')).resolves.toBe(120);
    expect(redis.get).toHaveBeenCalledWith('cache:team_qpm_limit:team-1');
  });

  it.each([null, '', '0', '-1', '1.5', 'not-a-number', String(Number.MAX_SAFE_INTEGER + 1)])(
    'treats malformed cached value %s as a miss',
    async (value) => {
      redis.get.mockResolvedValue(value);

      await expect(cache.getCachedLimit('team-1')).resolves.toBeNull();
    }
  );

  it('writes a positive limit with the historical one-hour TTL', async () => {
    await expect(cache.setCachedLimit({ teamId: 'team-1', limit: 120 })).resolves.toBeUndefined();
    expect(redis.set).toHaveBeenCalledWith({
      key: 'cache:team_qpm_limit:team-1',
      value: '120',
      ttlMs: 3_600_000
    });
  });

  it.each([0, -1, 1.5, '120'])('rejects invalid limits before writing %s', async (limit) => {
    await expect(
      cache.setCachedLimit({ teamId: 'team-1', limit: limit as any })
    ).rejects.toMatchObject({
      code: 'REDIS_INVALID_ARGUMENT',
      operation: 'teamQpm.set'
    });
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('deletes the historical cache key', async () => {
    await expect(cache.clearCachedLimit('team-1')).resolves.toBeUndefined();
    expect(redis.delete).toHaveBeenCalledWith('cache:team_qpm_limit:team-1');
  });

  it('propagates Redis cache failures', async () => {
    const error = new Error('redis down');
    redis.get.mockRejectedValue(error);

    await expect(cache.getCachedLimit('team-1')).rejects.toBe(error);
  });
});
