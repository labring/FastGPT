import { asRedisLogicalKey, redisRepositoryAdapter, type RedisStoreAdapter } from '../adapter';
import { FiniteNumberSchema } from '../runtime/schema';
import { z } from 'zod';

const TEAM_POINT_CACHE_TTL_MS = 60 * 1000;
const TEAM_POINT_CACHE_TTL_SECONDS = 60;
const TEAM_POINT_SURPLUS_KEY_PREFIX = 'cache:team_point_surplus:';
const TEAM_POINT_TOTAL_KEY_PREFIX = 'cache:team_point_total:';
const TeamPointCacheValueSchema = z
  .string()
  .refine((value) => value.trim() !== '', { error: 'cache value must not be empty' })
  .transform(Number)
  .pipe(FiniteNumberSchema);

export type TeamPointRepositoryLogger = {
  warn: (message: string, metadata: Record<string, unknown>) => void;
};

export type TeamPointRepositoryDependencies = {
  redis?: Pick<RedisStoreAdapter, 'deleteMany' | 'getPair' | 'incrementWithTtl' | 'setPair'>;
  logger?: TeamPointRepositoryLogger;
};

export type TeamPointCache = {
  totalPoints: number;
  surplusPoints: number;
};

const noopLogger: TeamPointRepositoryLogger = {
  warn: () => undefined
};

/**
 * 创建团队积分双 key cache Repository。
 *
 * 两个积分值必须作为同一版本成对读取和刷新；Redis 只承担加速，读取异常或 partial hit
 * 返回 miss 让 wallet service 回源 Mongo。写入、增量和清理失败只记录 warning，不覆盖钱包主流程。
 */
export const createTeamPointRepository = ({
  redis = redisRepositoryAdapter,
  logger = noopLogger
}: TeamPointRepositoryDependencies = {}) => {
  const getKeys = (teamId: string) => ({
    surplus: asRedisLogicalKey(`${TEAM_POINT_SURPLUS_KEY_PREFIX}${teamId}`),
    total: asRedisLogicalKey(`${TEAM_POINT_TOTAL_KEY_PREFIX}${teamId}`)
  });

  const parsePoint = (value: string | null) => {
    if (value === null) return;
    const parsed = TeamPointCacheValueSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  };

  const parsePointInput = (value: number, field: string) => {
    const parsed = FiniteNumberSchema.safeParse(value);
    if (parsed.success) return parsed.data;

    logger.warn('Skipped invalid team point cache value', { field, value });
  };

  return {
    /** 成对读取积分缓存；partial hit、损坏值和 Redis 故障均降级为 miss。 */
    get: async (teamId: string): Promise<TeamPointCache | undefined> => {
      try {
        const keys = getKeys(teamId);
        const [surplusValue, totalValue] = await redis.getPair({
          first: keys.surplus,
          second: keys.total
        });
        const surplusPoints = parsePoint(surplusValue);
        const totalPoints = parsePoint(totalValue);

        if (surplusPoints === undefined || totalPoints === undefined) {
          return undefined;
        }

        return { totalPoints, surplusPoints };
      } catch (error) {
        logger.warn('Failed to get team point cache', { teamId, error });
        return undefined;
      }
    },
    /** 原子刷新两个积分 key；Redis 故障只记录降级日志。 */
    set: async ({
      teamId,
      totalPoints,
      surplusPoints
    }: {
      teamId: string;
      totalPoints: number;
      surplusPoints: number;
    }) => {
      const parsedTotalPoints = parsePointInput(totalPoints, 'totalPoints');
      const parsedSurplusPoints = parsePointInput(surplusPoints, 'surplusPoints');
      if (parsedTotalPoints === undefined || parsedSurplusPoints === undefined) return;

      try {
        const keys = getKeys(teamId);
        await redis.setPair({
          first: { key: keys.surplus, value: String(parsedSurplusPoints) },
          second: { key: keys.total, value: String(parsedTotalPoints) },
          ttlMs: TEAM_POINT_CACHE_TTL_MS
        });
      } catch (error) {
        logger.warn('Failed to set team point cache', { teamId, error });
      }
    },
    /** 原子增加 surplus；0 增量不会创建或刷新 cache key。 */
    incrementSurplus: async ({ teamId, value }: { teamId: string; value: number }) => {
      const parsedValue = parsePointInput(value, 'value');
      if (parsedValue === undefined) return;
      if (parsedValue === 0) return;

      try {
        await redis.incrementWithTtl({
          key: getKeys(teamId).surplus,
          increment: parsedValue,
          ttlSeconds: TEAM_POINT_CACHE_TTL_SECONDS
        });
      } catch (error) {
        logger.warn('Failed to increment team point cache', { teamId, value: parsedValue, error });
      }
    },
    /** 单条 multi-key DEL 清理两个积分 key；缓存故障不覆盖钱包主流程。 */
    clear: async (teamId: string) => {
      try {
        const keys = getKeys(teamId);
        await redis.deleteMany([keys.surplus, keys.total]);
      } catch (error) {
        logger.warn('Failed to clear team point cache', { teamId, error });
      }
    }
  };
};

export const teamPointRepository = createTeamPointRepository();

export type TeamPointRepository = ReturnType<typeof createTeamPointRepository>;
