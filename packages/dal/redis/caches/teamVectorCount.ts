import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import type { RedisCacheLogger } from '../types';

const TEAM_VECTOR_COUNT_CACHE_TTL_MS = 30 * 60 * 1000;
const TEAM_VECTOR_CACHE_OPERATION_TIMEOUT_MS = 3000;

export type TeamVectorCountCacheOptions = {
  redis?: RedisCacheAdapter;
  logger: RedisCacheLogger<'warn'>;
};

/**
 * 团队向量数量 Cache。
 *
 * 所有 Redis 操作都有独立 3 秒 deadline；读取失败按 miss 回源，写入和失效失败只记录
 * 日志。Cache 不在业务层叠加 legacy cache helper 的通用重试。
 */
export class TeamVectorCountCache {
  private readonly redis: RedisCacheAdapter;
  private readonly logger: RedisCacheLogger<'warn'>;

  constructor({ redis = redisCacheAdapter, logger }: TeamVectorCountCacheOptions) {
    this.redis = redis;
    this.logger = logger;
  }

  private getKey = (teamId: string) => asRedisLogicalKey(`cache:team_vector_count:${teamId}`);

  private runWithTimeout = async <T>({
    promise,
    timeoutMessage
  }: {
    promise: Promise<T>;
    timeoutMessage: string;
  }): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(timeoutMessage)),
            TEAM_VECTOR_CACHE_OPERATION_TIMEOUT_MS
          );
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  private runOperation = async <T>({
    teamId,
    operation,
    warnMessage,
    action
  }: {
    teamId: string;
    operation: string;
    warnMessage: string;
    action: () => Promise<T>;
  }) => {
    try {
      return await this.runWithTimeout({
        promise: action(),
        timeoutMessage: `${operation} timed out after ${TEAM_VECTOR_CACHE_OPERATION_TIMEOUT_MS}ms`
      });
    } catch (error) {
      this.logger.warn(warnMessage, { teamId, error });
      return undefined;
    }
  };

  /** 读取团队向量数量；miss、错误和超时统一返回 undefined 触发 VectorDB 回源。 */
  async get(teamId: string) {
    const count = await this.runOperation({
      teamId,
      operation: 'Get team vector count cache',
      warnMessage: 'Failed to get team vector count cache',
      action: () => this.redis.get(this.getKey(teamId))
    });
    return count ? Number(count) : undefined;
  }

  /** best-effort 写入缓存；调用方无需等待该结果才能返回 VectorDB 主结果。 */
  async set({ teamId, count }: { teamId: string; count: number }) {
    await this.runOperation({
      teamId,
      operation: 'Set team vector count cache',
      warnMessage: 'Failed to set team vector count cache',
      action: () =>
        this.redis.set({
          key: this.getKey(teamId),
          value: String(count),
          ttlMs: TEAM_VECTOR_COUNT_CACHE_TTL_MS
        })
    });
  }

  /** best-effort 失效缓存；Redis 故障不得覆盖 VectorDB 写入或删除结果。 */
  async invalidate(teamId: string) {
    await this.runOperation({
      teamId,
      operation: 'Invalidate team vector count cache',
      warnMessage: 'Failed to invalidate team vector count cache',
      action: () => this.redis.delete(this.getKey(teamId))
    });
  }
}
