import { describe, expect, it, vi } from 'vitest';
import { getAllKeysByPrefix } from '@fastgpt/service/common/redis/scan';

const getRedis = () => global.redisClient as any;

describe('getAllKeysByPrefix', () => {
  it('returns logical keys while scanning physical children', async () => {
    const redis = getRedis();
    const runtime = global.redisRuntime!;
    const getPhysicalConnection = vi.mocked(runtime.getCommandConnection);
    const getLegacyConnection = vi.mocked(runtime.getLegacyCommandConnection);
    getPhysicalConnection.mockClear();
    getLegacyConnection.mockClear();
    redis.scan.mockReset();
    redis.scan
      .mockResolvedValueOnce(['1', ['fastgpt:session:user:one', 'fastgpt:session:user:two']])
      .mockResolvedValueOnce(['0', ['fastgpt:session:user:three']]);

    await expect(getAllKeysByPrefix('session:user')).resolves.toEqual([
      'session:user:one',
      'session:user:two',
      'session:user:three'
    ]);
    expect(redis.scan).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      'fastgpt:session:user:*',
      'COUNT',
      1000
    );
    expect(getPhysicalConnection).toHaveBeenCalledTimes(1);
    expect(getLegacyConnection).not.toHaveBeenCalled();
  });

  it('returns an empty list without touching Redis for an empty prefix', async () => {
    const redis = getRedis();
    redis.scan.mockClear();

    await expect(getAllKeysByPrefix('')).resolves.toEqual([]);
    expect(redis.scan).not.toHaveBeenCalled();
  });

  it('rejects keys returned from another physical keyspace', async () => {
    const redis = getRedis();
    redis.scan.mockReset();
    redis.scan.mockResolvedValueOnce(['0', ['other:session:user:one']]);

    await expect(getAllKeysByPrefix('session:user')).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'scan.iterate'
    });
  });
});
