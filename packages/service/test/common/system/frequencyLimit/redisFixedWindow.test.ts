import { beforeEach, describe, expect, it } from 'vitest';
import { checkFixedWindowQpmLimit } from '@fastgpt/service/common/system/frequencyLimit/redisFixedWindow';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';

describe('checkFixedWindowQpmLimit', () => {
  beforeEach(async () => {
    await getGlobalRedisConnection().flushdb();
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
});
