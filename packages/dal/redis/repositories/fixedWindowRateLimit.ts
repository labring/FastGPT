import {
  asRedisLogicalKey,
  redisRepositoryAdapter,
  RedisInvalidArgumentError,
  type RedisStoreAdapter
} from '../adapter';
import { PositiveSafeIntegerSchema } from '../runtime/schema';

export type FixedWindowRateLimitResult = {
  allowed: boolean;
  currentCount: number;
  remaining: number;
  ttlSeconds: number;
  resetAt: number;
};

export type FixedWindowRateLimitRepositoryDependencies = {
  redis?: Pick<RedisStoreAdapter, 'consumeFixedWindow'>;
  now?: () => number;
};

/**
 * 创建固定窗口限流 Repository。
 *
 * 计数与 TTL 的原子性由 adapter 保证；Repository 只负责限制值校验和业务决策结果。
 * Redis 执行错误向上抛出，由认证或 API service 统一映射为 fail-closed。
 */
export const createFixedWindowRateLimitRepository = ({
  redis = redisRepositoryAdapter,
  now = Date.now
}: FixedWindowRateLimitRepositoryDependencies = {}) => ({
  consume: async ({
    key,
    limit,
    windowSeconds = 60
  }: {
    key: string;
    limit: number;
    windowSeconds?: number;
  }): Promise<FixedWindowRateLimitResult> => {
    const parsedLimit = PositiveSafeIntegerSchema.safeParse(limit);
    if (!parsedLimit.success) {
      throw new RedisInvalidArgumentError({
        operation: 'fixedWindow.consume',
        message: 'limit must be a positive safe integer'
      });
    }

    const { currentCount, ttlSeconds } = await redis.consumeFixedWindow({
      key: asRedisLogicalKey(key),
      windowSeconds
    });

    return {
      allowed: currentCount <= parsedLimit.data,
      currentCount,
      remaining: Math.max(0, parsedLimit.data - currentCount),
      ttlSeconds,
      resetAt: now() + ttlSeconds * 1000
    };
  }
});

export const fixedWindowRateLimitRepository = createFixedWindowRateLimitRepository();

export type FixedWindowRateLimitRepository = ReturnType<
  typeof createFixedWindowRateLimitRepository
>;
