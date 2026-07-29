import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import type { RedisCacheLogger } from '../types';

const DAILY_ACTIVE_DEDUPE_TTL_SECONDS = 24 * 60 * 60;

export type DailyActiveDedupeCacheOptions = {
  redis?: Pick<RedisCacheAdapter, 'setIfAbsent'>;
  logger: RedisCacheLogger<'warn'>;
};

/**
 * 每日活跃用户去重 Cache。
 *
 * 同一 UTC 日期内只有第一个请求能原子声明历史 key；Redis 故障时 fail-open，允许本次
 * tracking 继续写入事实存储，避免缓存故障造成活跃事件丢失。
 */
export class DailyActiveDedupeCache {
  private readonly redis: Pick<RedisCacheAdapter, 'setIfAbsent'>;
  private readonly logger: RedisCacheLogger<'warn'>;

  constructor({ redis = redisCacheAdapter, logger }: DailyActiveDedupeCacheOptions) {
    this.redis = redis;
    this.logger = logger;
  }

  /** 返回本次请求是否应记录 daily active；Redis 故障时降级为 true。 */
  async shouldRecord({ uid, date }: { uid: string; date: string }) {
    try {
      return await this.redis.setIfAbsent({
        key: asRedisLogicalKey(`cache:dailyUserActive:${uid}_${date}`),
        value: '1',
        ttlSeconds: DAILY_ACTIVE_DEDUPE_TTL_SECONDS
      });
    } catch (error) {
      this.logger.warn('Daily active dedupe failed open', { error });
      return true;
    }
  }
}
