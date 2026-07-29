import {
  asRedisLogicalKey,
  redisCacheAdapter,
  RedisInvalidArgumentError,
  type RedisCacheAdapter
} from '../adapter';
import { PositiveSafeIntegerSchema } from '../runtime/schema';
import { z } from 'zod';

const TEAM_QPM_CACHE_TTL_MS = 60 * 60 * 1000;
const TEAM_QPM_KEY_PREFIX = 'cache:team_qpm_limit:';
const TeamQpmCacheValueSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(PositiveSafeIntegerSchema);

export type TeamQpmCacheOptions = {
  redis?: Pick<RedisCacheAdapter, 'delete' | 'get' | 'set'>;
};

/**
 * Team QPM 配置 Cache。
 *
 * 只拥有 Redis cache key、字符串 codec、TTL 和清理语义；套餐回源与默认值由 wallet service
 * 决定。损坏缓存按 miss 处理，避免把 NaN 当成“不限流”。
 */
export class TeamQpmCache {
  private readonly redis: Pick<RedisCacheAdapter, 'delete' | 'get' | 'set'>;

  constructor({ redis = redisCacheAdapter }: TeamQpmCacheOptions = {}) {
    this.redis = redis;
  }

  private getKey = (teamId: string) => asRedisLogicalKey(`${TEAM_QPM_KEY_PREFIX}${teamId}`);

  async getCachedLimit(teamId: string): Promise<number | null> {
    const cached = await this.redis.get(this.getKey(teamId));
    if (cached === null) return null;

    const parsed = TeamQpmCacheValueSchema.safeParse(cached);
    return parsed.success ? parsed.data : null;
  }

  async setCachedLimit({ teamId, limit }: { teamId: string; limit: number }) {
    const parsedLimit = PositiveSafeIntegerSchema.safeParse(limit);
    if (!parsedLimit.success) {
      throw new RedisInvalidArgumentError({
        operation: 'teamQpm.set',
        message: 'limit must be a positive safe integer'
      });
    }

    await this.redis.set({
      key: this.getKey(teamId),
      value: String(parsedLimit.data),
      ttlMs: TEAM_QPM_CACHE_TTL_MS
    });
  }

  async clearCachedLimit(teamId: string) {
    await this.redis.delete(this.getKey(teamId));
  }
}

export const teamQpmCache = new TeamQpmCache();
