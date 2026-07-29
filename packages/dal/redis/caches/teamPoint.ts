import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import { FiniteNumberSchema } from '../runtime/schema';
import type { RedisCacheLogger } from '../types';
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

export type TeamPointCacheOptions = {
  redis?: Pick<RedisCacheAdapter, 'deleteMany' | 'getPair' | 'incrementWithTtl' | 'setPair'>;
  logger?: RedisCacheLogger<'warn'>;
};

export type TeamPointSnapshot = {
  totalPoints: number;
  surplusPoints: number;
};

const noopLogger: RedisCacheLogger<'warn'> = {
  warn: () => undefined
};

/**
 * 团队积分双 key Cache。
 *
 * 两个积分值必须作为同一版本成对读取和刷新；Redis 只承担加速，读取异常或 partial hit
 * 返回 miss 让 wallet service 回源 Mongo。写入、增量和清理失败只记录 warning，不覆盖钱包主流程。
 */
export class TeamPointCache {
  private readonly redis: Pick<
    RedisCacheAdapter,
    'deleteMany' | 'getPair' | 'incrementWithTtl' | 'setPair'
  >;
  private readonly logger: RedisCacheLogger<'warn'>;

  constructor({ redis = redisCacheAdapter, logger = noopLogger }: TeamPointCacheOptions = {}) {
    this.redis = redis;
    this.logger = logger;
  }

  private getKeys = (teamId: string) => ({
    surplus: asRedisLogicalKey(`${TEAM_POINT_SURPLUS_KEY_PREFIX}${teamId}`),
    total: asRedisLogicalKey(`${TEAM_POINT_TOTAL_KEY_PREFIX}${teamId}`)
  });

  private parsePoint = (value: string | null) => {
    if (value === null) return;
    const parsed = TeamPointCacheValueSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  };

  private parsePointInput = (value: number, field: string) => {
    const parsed = FiniteNumberSchema.safeParse(value);
    if (parsed.success) return parsed.data;

    this.logger.warn('Skipped invalid team point cache value', { field, value });
  };

  /** 成对读取积分缓存；partial hit、损坏值和 Redis 故障均降级为 miss。 */
  async get(teamId: string): Promise<TeamPointSnapshot | undefined> {
    try {
      const keys = this.getKeys(teamId);
      const [surplusValue, totalValue] = await this.redis.getPair({
        first: keys.surplus,
        second: keys.total
      });
      const surplusPoints = this.parsePoint(surplusValue);
      const totalPoints = this.parsePoint(totalValue);

      if (surplusPoints === undefined || totalPoints === undefined) {
        return undefined;
      }

      return { totalPoints, surplusPoints };
    } catch (error) {
      this.logger.warn('Failed to get team point cache', { teamId, error });
      return undefined;
    }
  }

  /** 原子刷新两个积分 key；Redis 故障只记录降级日志。 */
  async set({
    teamId,
    totalPoints,
    surplusPoints
  }: {
    teamId: string;
    totalPoints: number;
    surplusPoints: number;
  }) {
    const parsedTotalPoints = this.parsePointInput(totalPoints, 'totalPoints');
    const parsedSurplusPoints = this.parsePointInput(surplusPoints, 'surplusPoints');
    if (parsedTotalPoints === undefined || parsedSurplusPoints === undefined) return;

    try {
      const keys = this.getKeys(teamId);
      await this.redis.setPair({
        first: { key: keys.surplus, value: String(parsedSurplusPoints) },
        second: { key: keys.total, value: String(parsedTotalPoints) },
        ttlMs: TEAM_POINT_CACHE_TTL_MS
      });
    } catch (error) {
      this.logger.warn('Failed to set team point cache', { teamId, error });
    }
  }

  /** 原子增加 surplus；0 增量不会创建或刷新 cache key。 */
  async incrementSurplus({ teamId, value }: { teamId: string; value: number }) {
    const parsedValue = this.parsePointInput(value, 'value');
    if (parsedValue === undefined) return;
    if (parsedValue === 0) return;

    try {
      await this.redis.incrementWithTtl({
        key: this.getKeys(teamId).surplus,
        increment: parsedValue,
        ttlSeconds: TEAM_POINT_CACHE_TTL_SECONDS
      });
    } catch (error) {
      this.logger.warn('Failed to increment team point cache', {
        teamId,
        value: parsedValue,
        error
      });
    }
  }

  /** 单条 multi-key DEL 清理两个积分 key；缓存故障不覆盖钱包主流程。 */
  async clear(teamId: string) {
    try {
      const keys = this.getKeys(teamId);
      await this.redis.deleteMany([keys.surplus, keys.total]);
    } catch (error) {
      this.logger.warn('Failed to clear team point cache', { teamId, error });
    }
  }
}

export const teamPointCache = new TeamPointCache();
