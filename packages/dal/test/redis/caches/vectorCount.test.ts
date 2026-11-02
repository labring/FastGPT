import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { VectorCountCache } from '@fastgpt/dal/redis/caches/vectorCount';

const scope = { teamId: 'team-1' };
const redis = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
const logger = { warn: vi.fn() };

beforeEach(() => {
  Object.values(redis).forEach((mock) => mock.mockReset());
  logger.warn.mockReset();
  redis.get.mockResolvedValue(null);
  redis.set.mockResolvedValue(undefined);
  redis.delete.mockResolvedValue(false);
});
afterEach(() => vi.useRealTimers());

describe('VectorCountCache key isolation and TTL', () => {
  it.each([
    { scope, key: 'fastgpt:cache:team_vector_count:team-1' },
    {
      scope: { ...scope, datasetId: 'dataset-1' },
      key: 'fastgpt:cache:dataset_vector_count:team-1:dataset-1'
    }
  ])('uses the expected key for $scope', async ({ scope, key }) => {
    const commandClient = {
      get: vi.fn().mockResolvedValue('0'),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(0)
    };
    const adapter = new RedisCacheAdapter({ getCommandClient: () => commandClient as any });
    const cache = new VectorCountCache({ redis: adapter, logger });

    await expect(cache.get(scope)).resolves.toBe(0);
    await cache.set({ ...scope, count: 42 });
    await cache.invalidate(scope);

    expect(commandClient.get).toHaveBeenCalledWith(key);
    expect(commandClient.set).toHaveBeenCalledWith(key, '42', 'PX', 1_800_000);
    expect(commandClient.del).toHaveBeenCalledWith(key);
    await cache.get({ ...scope, teamId: 'team-2' });
    expect(commandClient.get).toHaveBeenLastCalledWith(key.replace('team-1', 'team-2'));
  });
});

describe('VectorCountCache.get', () => {
  it('parses decimal counts and treats missing or invalid values as cache misses', async () => {
    const cache = new VectorCountCache({ redis, logger });
    for (const [value, expected] of [
      ['150', 150],
      ['0', 0]
    ] as const) {
      redis.get.mockResolvedValueOnce(value);
      await expect(cache.get(scope)).resolves.toBe(expected);
    }
    for (const value of [
      null,
      undefined,
      'NaN',
      'Infinity',
      '-1',
      '1.5',
      '0x10',
      '0b10',
      '1e3',
      '',
      '   ',
      '9007199254740992'
    ]) {
      redis.get.mockResolvedValueOnce(value);
      await expect(cache.get(scope)).resolves.toBeUndefined();
    }
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

// 三个公开方法共用超时封装；统一验证失败语义，避免分别复制错误和超时测例。
describe.each([
  { method: 'get', command: 'get', operation: 'get', scope },
  {
    method: 'get',
    command: 'get',
    operation: 'get',
    scope: { ...scope, datasetId: 'dataset-1' }
  },
  { method: 'set', command: 'set', operation: 'set', scope },
  { method: 'invalidate', command: 'delete', operation: 'invalidate', scope }
] as const)('VectorCountCache.$method failure handling for $scope', (testCase) => {
  it.each(['rejection', 'timeout'] as const)('logs a %s and returns undefined', async (failure) => {
    const error = new Error('Redis unavailable');
    if (failure === 'timeout') {
      vi.useFakeTimers();
      redis[testCase.command].mockReturnValueOnce(new Promise(() => {}));
    } else {
      redis[testCase.command].mockRejectedValueOnce(error);
    }

    const cache = new VectorCountCache({ redis, logger });
    const result =
      testCase.method === 'set'
        ? cache.set({ ...testCase.scope, count: 42 })
        : cache[testCase.method](testCase.scope);
    if (failure === 'timeout') await vi.advanceTimersByTimeAsync(3000);

    await expect(result).resolves.toBeUndefined();
    const target = 'datasetId' in testCase.scope ? 'dataset' : 'team';
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      `Failed to ${testCase.operation} ${target} vector count cache`,
      { ...testCase.scope, error: failure === 'timeout' ? expect.any(Error) : error }
    );
  });
});
