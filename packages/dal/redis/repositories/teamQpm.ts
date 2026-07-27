import {
  asRedisLogicalKey,
  redisRepositoryAdapter,
  RedisInvalidArgumentError,
  type RedisStoreAdapter
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

export type TeamQpmRepositoryDependencies = {
  redis?: Pick<RedisStoreAdapter, 'delete' | 'get' | 'set'>;
};

/**
 * 创建 Team QPM 配置缓存 Repository。
 *
 * 只拥有 Redis cache key、字符串 codec、TTL 和清理语义；套餐回源与默认值由 wallet service
 * 决定。损坏缓存按 miss 处理，避免把 NaN 当成“不限流”。
 */
export const createTeamQpmRepository = ({
  redis = redisRepositoryAdapter
}: TeamQpmRepositoryDependencies = {}) => {
  const getKey = (teamId: string) => asRedisLogicalKey(`${TEAM_QPM_KEY_PREFIX}${teamId}`);

  return {
    getCachedLimit: async (teamId: string): Promise<number | null> => {
      const cached = await redis.get(getKey(teamId));
      if (cached === null) return null;

      const parsed = TeamQpmCacheValueSchema.safeParse(cached);
      return parsed.success ? parsed.data : null;
    },
    setCachedLimit: async ({ teamId, limit }: { teamId: string; limit: number }) => {
      const parsedLimit = PositiveSafeIntegerSchema.safeParse(limit);
      if (!parsedLimit.success) {
        throw new RedisInvalidArgumentError({
          operation: 'teamQpm.set',
          message: 'limit must be a positive safe integer'
        });
      }

      await redis.set({
        key: getKey(teamId),
        value: String(parsedLimit.data),
        ttlMs: TEAM_QPM_CACHE_TTL_MS
      });
    },
    clearCachedLimit: async (teamId: string) => {
      await redis.delete(getKey(teamId));
    }
  };
};

export const teamQpmRepository = createTeamQpmRepository();

export type TeamQpmRepository = ReturnType<typeof createTeamQpmRepository>;
