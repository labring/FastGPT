import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedWindowRateLimitCache } from '@fastgpt/dal/redis/caches';

describe('FixedWindowRateLimitCache', () => {
  const consumeFixedWindow = vi.fn();
  const now = vi.fn(() => 1_000_000);
  const cache = new FixedWindowRateLimitCache({
    redis: { consumeFixedWindow } as any,
    now
  });

  beforeEach(() => {
    vi.clearAllMocks();
    consumeFixedWindow.mockResolvedValue({ currentCount: 2, ttlSeconds: 58 });
  });

  it('returns an allow decision, remaining quota and reset timestamp', async () => {
    await expect(
      cache.consume({
        key: 'frequency:chat:team-1',
        limit: 5,
        windowSeconds: 60
      })
    ).resolves.toEqual({
      allowed: true,
      currentCount: 2,
      remaining: 3,
      ttlSeconds: 58,
      resetAt: 1_058_000
    });
    expect(consumeFixedWindow).toHaveBeenCalledWith({
      key: 'frequency:chat:team-1',
      windowSeconds: 60
    });
  });

  it('blocks after the limit and clamps remaining quota to zero', async () => {
    consumeFixedWindow.mockResolvedValue({ currentCount: 6, ttlSeconds: 4 });

    await expect(cache.consume({ key: 'frequency:chat:team-1', limit: 5 })).resolves.toMatchObject({
      allowed: false,
      currentCount: 6,
      remaining: 0,
      ttlSeconds: 4,
      resetAt: 1_004_000
    });
    expect(consumeFixedWindow).toHaveBeenCalledWith({
      key: 'frequency:chat:team-1',
      windowSeconds: 60
    });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '5'])(
    'rejects invalid rate limit %s before Redis access',
    async (limit) => {
      await expect(
        cache.consume({ key: 'frequency:chat:team-1', limit: limit as any })
      ).rejects.toMatchObject({
        code: 'REDIS_INVALID_ARGUMENT',
        operation: 'fixedWindow.consume'
      });
      expect(consumeFixedWindow).not.toHaveBeenCalled();
    }
  );

  it('preserves Redis errors for the service layer to map to fail-closed', async () => {
    const error = new Error('redis down');
    consumeFixedWindow.mockRejectedValue(error);

    await expect(cache.consume({ key: 'frequency:chat:team-1', limit: 5 })).rejects.toBe(error);
  });
});
