import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { SuccessMarkerCache } from '@fastgpt/dal/redis/caches';

describe('SuccessMarkerCache', () => {
  const redis = {
    delete: vi.fn(),
    get: vi.fn(),
    set: vi.fn()
  };

  const params = {
    scope: 'integration-report',
    segments: ['crm', 'lifecycle', 'consumption', 'visitor/1']
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    redis.delete.mockResolvedValue(true);
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue(undefined);
  });

  it('uses the shared FastGPT physical prefix and encoded key segments', async () => {
    const commandClient = {
      get: vi.fn().mockResolvedValue('1'),
      set: vi.fn().mockResolvedValue('OK')
    };
    const adapter = new RedisCacheAdapter({ getCommandClient: () => commandClient as any });
    const cache = new SuccessMarkerCache({ redis: adapter });

    await expect(cache.has(params)).resolves.toBe(true);
    await cache.mark({ params });

    const physicalKey =
      'fastgpt:success-marker:v1:integration-report:crm:lifecycle:consumption:visitor%2F1';
    expect(commandClient.get).toHaveBeenCalledWith(physicalKey);
    expect(commandClient.set).toHaveBeenCalledWith(physicalKey, '1');
  });

  it('returns false for a missing marker and writes a permanent marker by default', async () => {
    const cache = new SuccessMarkerCache({ redis: redis as any });

    await expect(cache.has(params)).resolves.toBe(false);
    await cache.mark({ params });

    expect(redis.set).toHaveBeenCalledWith({
      key: 'success-marker:v1:integration-report:crm:lifecycle:consumption:visitor%2F1',
      value: '1',
      ttlMs: undefined
    });
  });

  it('supports temporary markers and explicit clearing', async () => {
    const cache = new SuccessMarkerCache({ redis: redis as any });

    await cache.mark({ params, ttlMs: 60_000 });
    await expect(cache.clear(params)).resolves.toBe(true);

    expect(redis.set).toHaveBeenCalledWith(expect.objectContaining({ ttlMs: 60_000 }));
    expect(redis.delete).toHaveBeenCalledWith(
      'success-marker:v1:integration-report:crm:lifecycle:consumption:visitor%2F1'
    );
  });

  it('propagates Redis failures so the interface layer can choose fail-open behavior', async () => {
    const error = new Error('redis unavailable');
    redis.get.mockRejectedValueOnce(error);
    const cache = new SuccessMarkerCache({ redis: redis as any });

    await expect(cache.has(params)).rejects.toBe(error);
  });
});
