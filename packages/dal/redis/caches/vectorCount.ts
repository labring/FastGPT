import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import type { RedisCacheLogger } from '../types';
import { withTimeout } from '@fastgpt/global/common/system/utils';

const VECTOR_COUNT_CACHE_TTL_MS = 30 * 60 * 1000;
const VECTOR_COUNT_CACHE_OPERATION_TIMEOUT_MS = 3000;

export type VectorCountScope = { teamId: string; datasetId?: string };
export type VectorCountCacheOptions = {
  redis?: Pick<RedisCacheAdapter, 'get' | 'set' | 'delete'>;
  logger: RedisCacheLogger<'warn'>;
};

/** 团队和知识库向量行数的临时缓存；Redis 失败按 miss 或 best-effort 写入处理。 */
export class VectorCountCache {
  private readonly redis: Pick<RedisCacheAdapter, 'get' | 'set' | 'delete'>;
  private readonly logger: RedisCacheLogger<'warn'>;

  constructor({ redis = redisCacheAdapter, logger }: VectorCountCacheOptions) {
    this.redis = redis;
    this.logger = logger;
  }

  /** 保留历史团队 key；知识库 key 同时隔离团队，避免错误团队的零值污染其他团队的查询。 */
  private getKey({ teamId, datasetId }: VectorCountScope) {
    return asRedisLogicalKey(
      datasetId === undefined
        ? `cache:team_vector_count:${teamId}`
        : `cache:dataset_vector_count:${teamId}:${datasetId}`
    );
  }

  /** 每次 Redis 操作独立限制为三秒，缓存故障不改变已经成功的向量库操作结果。 */
  private async runOperation<T>({
    scope,
    operation,
    action
  }: {
    scope: VectorCountScope;
    operation: 'Get' | 'Set' | 'Invalidate';
    action: () => Promise<T>;
  }) {
    const target = scope.datasetId === undefined ? 'team' : 'dataset';
    const name = `${operation} ${target} vector count cache`;
    try {
      return await withTimeout(
        action(),
        VECTOR_COUNT_CACHE_OPERATION_TIMEOUT_MS,
        `${name} timed out after ${VECTOR_COUNT_CACHE_OPERATION_TIMEOUT_MS}ms`
      );
    } catch (error) {
      this.logger.warn(`Failed to ${operation.toLowerCase()} ${target} vector count cache`, {
        ...scope,
        error
      });
      return undefined;
    }
  }

  /** 零值也是命中；缺失、非法数字、错误和超时返回 undefined，由调用方重新统计。 */
  async get(scope: VectorCountScope) {
    const count = await this.runOperation({
      scope,
      operation: 'Get',
      action: () => this.redis.get(this.getKey(scope))
    });
    if (count === null || count === undefined || count.trim().length === 0) return undefined;
    if (!/^\d+$/.test(count)) return undefined;
    const parsed = Number(count);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
  }

  /** 计数只保存三十分钟；写入失败只记录日志，调用方可以不等待回填。 */
  async set({ count, ...scope }: VectorCountScope & { count: number }) {
    await this.runOperation({
      scope,
      operation: 'Set',
      action: () =>
        this.redis.set({
          key: this.getKey(scope),
          value: String(count),
          ttlMs: VECTOR_COUNT_CACHE_TTL_MS
        })
    });
  }

  /** 向量增删成功后失效相应计数；失败或超时仍由 TTL 兜底过期。 */
  async invalidate(scope: VectorCountScope) {
    await this.runOperation({
      scope,
      operation: 'Invalidate',
      action: () => this.redis.delete(this.getKey(scope))
    });
  }
}
