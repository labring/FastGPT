import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRedisRuntime, toPhysicalRedisKey } from '@fastgpt/dal/redis/runtime';
import {
  RATE_LIMIT_KEY_PREFIX,
  defineRateLimitInterface
} from '@fastgpt/service/common/rateLimit/core';
import { checkIPRateLimit } from '@fastgpt/service/common/rateLimit/interface/ip';
import { RateLimitSceneEnum } from '@fastgpt/service/common/rateLimit/type';

const getRedisConnection = () => getRedisRuntime().getCommandConnection();

describe('rateLimit core', () => {
  beforeEach(async () => {
    await getRedisConnection().flushdb();
  });

  it('统一生成 rate-limit 场景 key，并按接口和 IP 隔离', async () => {
    const params = {
      id: 'wechat-login-qrcode',
      ip: '192.0.2.1',
      limit: 1,
      seconds: 60
    };

    await expect(checkIPRateLimit(params)).resolves.toBe(true);
    await expect(checkIPRateLimit(params)).resolves.toBe(false);
    await expect(checkIPRateLimit({ ...params, ip: '192.0.2.2' })).resolves.toBe(true);

    const key = toPhysicalRedisKey(`${RATE_LIMIT_KEY_PREFIX}:ip:wechat-login-qrcode:ip:192.0.2.1`);
    await expect(getRedisConnection().get(key)).resolves.toBe(2);
  });

  it('对动态 key segment 进行编码', async () => {
    await checkIPRateLimit({
      id: 'encoded-policy',
      ip: 'user:name@example.com',
      limit: 1,
      seconds: 60
    });

    const key = toPhysicalRedisKey(
      `${RATE_LIMIT_KEY_PREFIX}:ip:encoded-policy:ip:user%3Aname%40example.com`
    );
    await expect(getRedisConnection().get(key)).resolves.toBe(1);
  });

  it('支持按增量原子消费额度', async () => {
    const rateLimit = defineRateLimitInterface<{ increment: number }>({
      scene: RateLimitSceneEnum.Upload,
      policy: 'increment-test',
      failureMode: 'closed',
      getKeySegments: () => ['identity', 'member-1'],
      getLimit: () => 3,
      getWindowSeconds: () => 60,
      getIncrement: ({ increment }) => increment,
      createError: () => new Error('rate limited')
    });

    await expect(rateLimit.assert({ increment: 2 })).resolves.toBeUndefined();
    await expect(rateLimit.assert({ increment: 2 })).rejects.toBeTruthy();
  });

  it('fail-open 接口在 Redis 故障时放行', async () => {
    vi.mocked(getRedisConnection().multi).mockImplementationOnce(() => {
      throw new Error('Redis unavailable');
    });

    await expect(
      checkIPRateLimit({ id: 'redis-failure', ip: '192.0.2.3', limit: 1, seconds: 60 })
    ).resolves.toBe(true);
  });

  it('fail-closed 接口在 Redis 故障时拒绝', async () => {
    const rateLimit = defineRateLimitInterface<{ account: string }>({
      scene: RateLimitSceneEnum.AccountVerification,
      policy: 'fail-closed-test',
      failureMode: 'closed',
      getKeySegments: ({ account }) => ['account', account],
      getLimit: () => 1,
      getWindowSeconds: () => 60,
      createError: () => new Error('rate limited')
    });
    vi.mocked(getRedisConnection().multi).mockImplementationOnce(() => {
      throw new Error('Redis unavailable');
    });

    await expect(rateLimit.check({ account: 'test@example.com' })).resolves.toBe(false);
  });

  it('非法额度配置不会被故障策略隐藏', async () => {
    await expect(
      checkIPRateLimit({ id: 'invalid-limit', ip: '192.0.2.4', limit: 0, seconds: 60 })
    ).rejects.toMatchObject({
      code: 'REDIS_INVALID_ARGUMENT',
      operation: 'rateLimit.consume'
    });
  });
});
