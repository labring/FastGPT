import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatGenerationLeaseCache } from '@fastgpt/dal/redis/lease/chat/chatGenerationLease';
import type { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';

describe('ChatGenerationLeaseCache.tryAcquire', () => {
  const redis = { evalScript: vi.fn() };
  const cache = new ChatGenerationLeaseCache({ redis: redis as unknown as RedisCacheAdapter });
  const params = { sourceType: 'app', sourceId: '507F1F77BCF86CD799439012', chatId: 'chat-1' };

  beforeEach(() => {
    redis.evalScript.mockReset().mockResolvedValue([1, null]);
  });

  it('acquires and returns the stop snapshot without deleting it', async () => {
    redis.evalScript.mockResolvedValueOnce([1, 'old-stop']);
    await expect(cache.tryAcquire({ params, token: 'token', ttlMs: 60_000 })).resolves.toEqual({
      acquired: true,
      stopSignal: 'old-stop',
      occupiedValue: null
    });
    expect(redis.evalScript).toHaveBeenCalledWith({
      script: expect.any(String),
      keys: [
        'chat:generation:lease:app:507f1f77bcf86cd799439012:chat-1',
        'agent_runtime_stopping:app:507f1f77bcf86cd799439012:chat-1'
      ],
      args: ['token', 60_000]
    });
    redis.evalScript.mockResolvedValue([0, 'active-lease']);
    await expect(cache.tryAcquire({ params, token: 'other', ttlMs: 60_000 })).resolves.toEqual({
      acquired: false,
      stopSignal: null,
      occupiedValue: 'active-lease'
    });
  });

  it('propagates Redis errors and rejects unsupported results for service-level degradation', async () => {
    const error = new Error('Redis unavailable');
    redis.evalScript.mockRejectedValueOnce(error);
    await expect(cache.tryAcquire({ params, token: 'token', ttlMs: 60_000 })).rejects.toBe(error);
    redis.evalScript.mockResolvedValue('OK');
    await expect(cache.tryAcquire({ params, token: 'token', ttlMs: 60_000 })).rejects.toThrow(
      'unsupported response'
    );
  });

  it.each([
    { token: '', ttlMs: 60_000 },
    { token: 'token', ttlMs: 0 },
    { token: 'token', ttlMs: 1.5 }
  ])('rejects invalid lease input before writing %#', async (input) => {
    await expect(cache.tryAcquire({ params, ...input })).rejects.toThrow();
    expect(redis.evalScript).not.toHaveBeenCalled();
  });
});
