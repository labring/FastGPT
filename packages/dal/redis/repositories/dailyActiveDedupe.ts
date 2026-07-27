import { asRedisLogicalKey, redisRepositoryAdapter, type RedisStoreAdapter } from '../adapter';

const DAILY_ACTIVE_DEDUPE_TTL_SECONDS = 24 * 60 * 60;

export type DailyActiveDedupeRepositoryLogger = {
  warn: (message: string, metadata: Record<string, unknown>) => void;
};

export type DailyActiveDedupeRepositoryDependencies = {
  redis?: Pick<RedisStoreAdapter, 'setIfAbsent'>;
  logger: DailyActiveDedupeRepositoryLogger;
};

/**
 * 创建每日活跃用户去重 Repository。
 *
 * 同一 UTC 日期内只有第一个请求能原子声明历史 key；Redis 故障时 fail-open，允许本次
 * tracking 继续写入事实存储，避免缓存故障造成活跃事件丢失。
 */
export const createDailyActiveDedupeRepository = ({
  redis = redisRepositoryAdapter,
  logger
}: DailyActiveDedupeRepositoryDependencies) => ({
  /** 返回本次请求是否应记录 daily active；Redis 故障时降级为 true。 */
  shouldRecord: async ({ uid, date }: { uid: string; date: string }) => {
    try {
      return await redis.setIfAbsent({
        key: asRedisLogicalKey(`cache:dailyUserActive:${uid}_${date}`),
        value: '1',
        ttlSeconds: DAILY_ACTIVE_DEDUPE_TTL_SECONDS
      });
    } catch (error) {
      logger.warn('Daily active dedupe failed open', { error });
      return true;
    }
  }
});

export type DailyActiveDedupeRepository = ReturnType<typeof createDailyActiveDedupeRepository>;
