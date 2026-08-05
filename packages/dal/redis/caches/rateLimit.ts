import {
  asRedisLogicalKey,
  redisCacheAdapter,
  RedisInvalidArgumentError,
  type RedisCacheAdapter
} from '../adapter';
import { PositiveSafeIntegerSchema } from '../runtime/schema';

export type RateLimitResult = {
  allowed: boolean;
  currentCount: number;
  remaining: number;
  ttlSeconds: number;
  resetAt: number;
};

export type RateLimitCacheOptions = {
  redis?: RedisCacheAdapter;
  now?: () => number;
};

/**
 * Redis 限流 Cache。
 *
 * 当前使用固定窗口算法。计数与 TTL 的原子性由 adapter 保证；Cache 只负责限制值校验
 * 和业务决策结果。Redis 执行错误向上抛出，由 Service 层按场景映射故障策略。
 */
export class RateLimitCache {
  private readonly redis: RedisCacheAdapter;
  private readonly now: () => number;

  constructor({ redis = redisCacheAdapter, now = Date.now }: RateLimitCacheOptions = {}) {
    this.redis = redis;
    this.now = now;
  }

  async consume({
    key,
    limit,
    windowSeconds = 60,
    increment = 1
  }: {
    key: string;
    limit: number;
    windowSeconds?: number;
    increment?: number;
  }): Promise<RateLimitResult> {
    const parsedLimit = PositiveSafeIntegerSchema.safeParse(limit);
    if (!parsedLimit.success) {
      throw new RedisInvalidArgumentError({
        operation: 'rateLimit.consume',
        message: 'limit must be a positive safe integer'
      });
    }

    const parsedIncrement = PositiveSafeIntegerSchema.safeParse(increment);
    if (!parsedIncrement.success) {
      throw new RedisInvalidArgumentError({
        operation: 'rateLimit.consume',
        message: 'increment must be a positive safe integer'
      });
    }

    const { currentCount, ttlSeconds } = await this.redis.consumeFixedWindow({
      key: asRedisLogicalKey(key),
      windowSeconds,
      increment: parsedIncrement.data
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

export const rateLimitCache = new RateLimitCache();
