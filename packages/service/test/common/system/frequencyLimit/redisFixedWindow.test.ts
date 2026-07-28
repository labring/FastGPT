import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRedisRuntime } from '@fastgpt/dal/redis/runtime';
import { RedisInvalidArgumentError } from '@fastgpt/dal/redis';
import {
  checkFixedWindowQpmLimit,
  createFixedWindowQpmLimitChecker
} from '@fastgpt/service/common/system/frequencyLimit/redisFixedWindow';

describe('checkFixedWindowQpmLimit', () => {
  beforeEach(async () => {
    await getRedisRuntime().getCommandConnection().flushdb();
  });

  it('同一个 key 在固定窗口内超过限制后返回 false', async () => {
    await expect(
      checkFixedWindowQpmLimit({ key: 'enterprise-auth:start:team:t1', limit: 3 })
    ).resolves.toBe(true);
    await expect(
      checkFixedWindowQpmLimit({ key: 'enterprise-auth:start:team:t1', limit: 3 })
    ).resolves.toBe(true);
    await expect(
      checkFixedWindowQpmLimit({ key: 'enterprise-auth:start:team:t1', limit: 3 })
    ).resolves.toBe(true);
    await expect(
      checkFixedWindowQpmLimit({ key: 'enterprise-auth:start:team:t1', limit: 3 })
    ).resolves.toBe(false);
  });

  it('不同 key 独立计数', async () => {
    await expect(
      checkFixedWindowQpmLimit({ key: 'enterprise-auth:start:team:t1', limit: 1 })
    ).resolves.toBe(true);
    await expect(
      checkFixedWindowQpmLimit({ key: 'enterprise-auth:start:team:t1', limit: 1 })
    ).resolves.toBe(false);
    await expect(
      checkFixedWindowQpmLimit({ key: 'enterprise-auth:start:team:t2', limit: 1 })
    ).resolves.toBe(true);
  });

  it('Redis execution failure is mapped to fail-closed', async () => {
    const consume = vi.fn().mockRejectedValue(new Error('redis down'));
    const check = createFixedWindowQpmLimitChecker({ repository: { consume } });

    await expect(check({ key: 'frequency:test:team-1', limit: 1 })).resolves.toBe(false);
  });

  it('invalid arguments are not hidden as a rate-limit denial', async () => {
    const error = new RedisInvalidArgumentError({
      operation: 'fixedWindow.consume',
      message: 'limit must be a positive safe integer'
    });
    const consume = vi.fn().mockRejectedValue(error);
    const check = createFixedWindowQpmLimitChecker({ repository: { consume } });

    await expect(check({ key: 'frequency:test:team-1', limit: 0 })).rejects.toBe(error);
  });
});
