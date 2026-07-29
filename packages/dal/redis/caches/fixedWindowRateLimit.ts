import {
  asRedisLogicalKey,
  redisCacheAdapter,
  RedisInvalidArgumentError,
  type RedisCacheAdapter
} from '../adapter';
import { PositiveSafeIntegerSchema } from '../runtime/schema';

export type FixedWindowRateLimitResult = {
  allowed: boolean;
  currentCount: number;
  remaining: number;
  ttlSeconds: number;
  resetAt: number;
};

export type FixedWindowRateLimitCacheOptions = {
  redis?: RedisCacheAdapter;
  now?: () => number;
};

/**
 * 固定窗口限流 Cache。
 *
 * 计数与 TTL 的原子性由 adapter 保证；Cache 只负责限制值校验和业务决策结果。
 * Redis 执行错误向上抛出，由认证或 API service 统一映射为 fail-closed。
 */
export class FixedWindowRateLimitCache {
  private readonly redis: RedisCacheAdapter;
  private readonly now: () => number;

  constructor({
    redis = redisCacheAdapter,
    now = Date.now
  }: FixedWindowRateLimitCacheOptions = {}) {
    this.redis = redis;
    this.now = now;
  }

  async consume({
    key,
    limit,
    windowSeconds = 60
  }: {
    key: string;
    limit: number;
    windowSeconds?: number;
  }): Promise<FixedWindowRateLimitResult> {
    const parsedLimit = PositiveSafeIntegerSchema.safeParse(limit);
    if (!parsedLimit.success) {
      throw new RedisInvalidArgumentError({
        operation: 'fixedWindow.consume',
        message: 'limit must be a positive safe integer'
      });
    }

    const { currentCount, ttlSeconds } = await this.redis.consumeFixedWindow({
      key: asRedisLogicalKey(key),
      windowSeconds
    });

    return {
      allowed: currentCount <= parsedLimit.data,
      currentCount,
      remaining: Math.max(0, parsedLimit.data - currentCount),
      ttlSeconds,
      resetAt: this.now() + ttlSeconds * 1000
    };
  }
}

export const fixedWindowRateLimitCache = new FixedWindowRateLimitCache();
