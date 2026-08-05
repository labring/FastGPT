import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitCache } from '@fastgpt/dal/redis/caches';

describe('RateLimitCache', () => {
  const consumeFixedWindow = vi.fn();
  const now = vi.fn(() => 1_000_000);
  const cache = new RateLimitCache({
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
        key: 'rate-limit:team:chat-qpm:team:team-1',
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
      key: 'rate-limit:team:chat-qpm:team:team-1',
      windowSeconds: 60,
      increment: 1
    });
  });

  it('blocks after the limit and clamps remaining quota to zero', async () => {
    consumeFixedWindow.mockResolvedValue({ currentCount: 6, ttlSeconds: 4 });

    await expect(
      cache.consume({ key: 'rate-limit:team:chat-qpm:team:team-1', limit: 5 })
    ).resolves.toMatchObject({
      allowed: false,
      currentCount: 6,
      remaining: 0,
      ttlSeconds: 4,
      resetAt: 1_004_000
    });
    expect(consumeFixedWindow).toHaveBeenCalledWith({
      key: 'rate-limit:team:chat-qpm:team:team-1',
      windowSeconds: 60,
      increment: 1
    });
  });

  it('passes a custom increment to Redis', async () => {
    await cache.consume({
      key: 'rate-limit:upload:file-count:identity:member-1',
      limit: 10,
      windowSeconds: 60,
      increment: 3
    });

    expect(consumeFixedWindow).toHaveBeenCalledWith({
      key: 'rate-limit:upload:file-count:identity:member-1',
      windowSeconds: 60,
      increment: 3
    });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '5'])(
    'rejects invalid rate limit %s before Redis access',
    async (limit) => {
      await expect(
        cache.consume({ key: 'rate-limit:team:chat-qpm:team:team-1', limit: limit as any })
      ).rejects.toMatchObject({
        code: 'REDIS_INVALID_ARGUMENT',
        operation: 'rateLimit.consume'
      });
      expect(consumeFixedWindow).not.toHaveBeenCalled();
    }
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2'])(
    'rejects invalid increment %s before Redis access',
    async (increment) => {
      await expect(
        cache.consume({
          key: 'rate-limit:team:chat-qpm:team:team-1',
          limit: 5,
          increment: increment as any
        })
      ).rejects.toMatchObject({
        code: 'REDIS_INVALID_ARGUMENT',
        operation: 'rateLimit.consume'
      });
      expect(consumeFixedWindow).not.toHaveBeenCalled();
    }
  );

  it('preserves Redis errors for the service layer to map to fail-closed', async () => {
    const error = new Error('redis down');
    consumeFixedWindow.mockRejectedValue(error);

    await expect(
      cache.consume({ key: 'rate-limit:team:chat-qpm:team:team-1', limit: 5 })
    ).rejects.toBe(error);
  });
});
