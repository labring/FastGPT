import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import type { RedisCacheLogger } from '../types';
import { randomUUID } from 'node:crypto';

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
  private getRevisionKey = (teamId: string) =>
    asRedisLogicalKey(`cache:team_vector_count_revision:${teamId}`);

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
    if (count === null || count === undefined || count.trim().length === 0) return undefined;
    if (!/^\d+$/.test(count)) return undefined;

    const parsedCount = Number(count);
    return Number.isSafeInteger(parsedCount) && parsedCount >= 0 ? parsedCount : undefined;
  }

  /** 计数前取得变更标记；Redis 不可用时不写缓存，但仍允许数据库计数返回。 */
  async getRevision(teamId: string) {
    const revision = await this.runOperation({
      teamId,
      operation: 'Get team vector count revision',
      warnMessage: 'Failed to get team vector count revision',
      action: () =>
        this.redis.evalScript({
          script: `local revision = redis.call('GET', KEYS[1])
          if revision then return revision end
          redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
          return ARGV[1]`,
          keys: [this.getRevisionKey(teamId)],
          args: [randomUUID(), TEAM_VECTOR_COUNT_CACHE_TTL_MS]
        })
    });
    return typeof revision === 'string' && revision.length > 0 ? revision : undefined;
  }

  /** 只有计数期间没有发生变更才回填；迟到的计数不得恢复已失效的旧值。 */
  async set({ teamId, count, revision }: { teamId: string; count: number; revision: string }) {
    await this.runOperation({
      teamId,
      operation: 'Set team vector count cache',
      warnMessage: 'Failed to set team vector count cache',
      action: () =>
        this.redis.evalScript({
          script: `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
          redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
          redis.call('PEXPIRE', KEYS[1], ARGV[3])
          return 1`,
          keys: [this.getRevisionKey(teamId), this.getKey(teamId)],
          args: [revision, count, TEAM_VECTOR_COUNT_CACHE_TTL_MS]
        })
    });
  }

  /** best-effort 失效缓存；Redis 故障不得覆盖 VectorDB 写入或删除结果。 */
  async invalidate(teamId: string) {
    await this.runOperation({
      teamId,
      operation: 'Invalidate team vector count cache',
      warnMessage: 'Failed to invalidate team vector count cache',
      action: () =>
        this.redis.evalScript({
          script: `redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
          return redis.call('DEL', KEYS[2])`,
          keys: [this.getRevisionKey(teamId), this.getKey(teamId)],
          args: [randomUUID(), TEAM_VECTOR_COUNT_CACHE_TTL_MS]
        })
    });
  }
}
