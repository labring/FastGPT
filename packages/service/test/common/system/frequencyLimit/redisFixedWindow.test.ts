import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisInvalidArgumentError } from '@fastgpt/dal/redis';
import { getRedisRuntime } from '@fastgpt/dal/redis/runtime';
import {
  checkFixedWindowQpmLimit,
  checkIPFrequencyLimit,
  checkRedisFrequencyLimit,
  createFixedWindowQpmLimitChecker,
  FREQUENCY_LIMIT_KEY_PREFIX
} from '@fastgpt/service/common/system/frequencyLimit/redisFixedWindow';

describe('checkRedisFrequencyLimit', () => {
  beforeEach(async () => {
    await getRedisRuntime().getCommandConnection().flushdb();
  });

  it('同一个 key 在固定窗口内超过限制后返回 false', async () => {
    await expect(
      checkRedisFrequencyLimit({
        group: 'enterprise-auth',
        id: 'start:team:t1',
        limit: 3,
        seconds: 60
      })
    ).resolves.toBe(true);
    await expect(
      checkRedisFrequencyLimit({
        group: 'enterprise-auth',
        id: 'start:team:t1',
        limit: 3,
        seconds: 60
      })
    ).resolves.toBe(true);
    await expect(
      checkRedisFrequencyLimit({
        group: 'enterprise-auth',
        id: 'start:team:t1',
        limit: 3,
        seconds: 60
      })
    ).resolves.toBe(true);
    await expect(
      checkRedisFrequencyLimit({
        group: 'enterprise-auth',
        id: 'start:team:t1',
        limit: 3,
        seconds: 60
      })
    ).resolves.toBe(false);
  });

  it('不同 key 独立计数', async () => {
    await expect(
      checkRedisFrequencyLimit({
        group: 'enterprise-auth',
        id: 'start:team:t1',
        limit: 1,
        seconds: 60
      })
    ).resolves.toBe(true);
    await expect(
      checkRedisFrequencyLimit({
        group: 'enterprise-auth',
        id: 'start:team:t1',
        limit: 1,
        seconds: 60
      })
    ).resolves.toBe(false);
    await expect(
      checkRedisFrequencyLimit({
        group: 'enterprise-auth',
        id: 'start:team:t2',
        limit: 1,
        seconds: 60
      })
    ).resolves.toBe(true);
  });

  it('IP 限流统一使用专用前缀并按接口和 IP 隔离', async () => {
    await expect(
      checkIPFrequencyLimit({ id: 'wechat-login-qrcode', ip: '192.0.2.1', limit: 1, seconds: 60 })
    ).resolves.toBe(true);
    await expect(
      checkIPFrequencyLimit({ id: 'wechat-login-qrcode', ip: '192.0.2.1', limit: 1, seconds: 60 })
    ).resolves.toBe(false);
    await expect(
      checkIPFrequencyLimit({ id: 'wechat-login-qrcode', ip: '192.0.2.2', limit: 1, seconds: 60 })
    ).resolves.toBe(true);

    await expect(
      getRedisRuntime()
        .getCommandConnection()
        .get(`fastgpt:${FREQUENCY_LIMIT_KEY_PREFIX}:ip:wechat-login-qrcode:192.0.2.1`)
    ).resolves.toBe(2);
  });

  it('统一按业务分组隔离 key，并支持批量增加计数', async () => {
    await expect(
      checkRedisFrequencyLimit({
        group: 'upload',
        id: 'member-1',
        limit: 3,
        seconds: 30,
        increment: 2
      })
    ).resolves.toBe(true);
    await expect(
      checkRedisFrequencyLimit({
        group: 'upload',
        id: 'member-1',
        limit: 3,
        seconds: 30,
        increment: 2
      })
    ).resolves.toBe(false);
    await expect(
      checkRedisFrequencyLimit({
        group: 'member',
        id: 'member-1',
        limit: 1,
        seconds: 30
      })
    ).resolves.toBe(true);
  });
});

describe('checkFixedWindowQpmLimit', () => {
  beforeEach(async () => {
    await getRedisRuntime().getCommandConnection().flushdb();
  });

  it('支持按指定增量消费额度', async () => {
    await expect(
      checkFixedWindowQpmLimit({ key: 'frequency:test:team-1', limit: 3, increment: 2 })
    ).resolves.toBe(true);
    await expect(
      checkFixedWindowQpmLimit({ key: 'frequency:test:team-1', limit: 3, increment: 2 })
    ).resolves.toBe(false);
  });

  it('Redis execution failure is mapped to fail-closed', async () => {
    const consume = vi.fn().mockRejectedValue(new Error('redis down'));
    const check = createFixedWindowQpmLimitChecker({ cache: { consume } });

    await expect(check({ key: 'frequency:test:team-1', limit: 1 })).resolves.toBe(false);
  });

  it('invalid arguments are not hidden as a rate-limit denial', async () => {
    const error = new RedisInvalidArgumentError({
      operation: 'fixedWindow.consume',
      message: 'limit must be a positive safe integer'
    });
    const consume = vi.fn().mockRejectedValue(error);
    const check = createFixedWindowQpmLimitChecker({ cache: { consume } });

    await expect(check({ key: 'frequency:test:team-1', limit: 0 })).rejects.toBe(error);
  });
});
