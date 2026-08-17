import { createRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import type { RedisCacheLogger } from '../types';

/** 注销状态缓存 TTL；生命周期变更会主动刷新或清理，TTL 只负责异常情况下的最终回收。 */
export const ACCOUNT_CANCELLATION_CACHE_TTL_MS = 5 * 60 * 1000;

export type AccountCancellationCacheScope = 'team' | 'member';

export type AccountCancellationCacheOptions = {
  redis?: RedisCacheAdapter;
  logger?: RedisCacheLogger<'warn'>;
};

const noopLogger: RedisCacheLogger<'warn'> = {
  warn: () => undefined
};

/**
 * API Key 注销状态 Cache。
 *
 * Cache 同时保存 active 和 inactive 两种短期状态；生命周期写入会主动覆盖 inactive，取消或
 * 完成注销会删除 marker。读取失败统一返回 miss，由 Service 回源 Mongo，避免 Redis 故障放行
 * 注销中的账号。
 */
export class AccountCancellationCache {
  private readonly redis: RedisCacheAdapter;
  private readonly logger: RedisCacheLogger<'warn'>;

  constructor({
    redis = redisCacheAdapter,
    logger = noopLogger
  }: AccountCancellationCacheOptions = {}) {
    this.redis = redis;
    this.logger = logger;
  }

  private getKey = (scope: AccountCancellationCacheScope, id: string) =>
    createRedisLogicalKey({
      namespace: 'account-cancellation',
      version: 1,
      segments: [scope, id]
    });

  /** 返回缓存状态；Redis miss、异常或损坏值均返回 undefined，交由调用方回源。 */
  async get(scope: AccountCancellationCacheScope, id: string): Promise<boolean | undefined> {
    try {
      const value = await this.redis.get(this.getKey(scope, id));
      if (value === null) return undefined;
      if (value === '1') return true;
      if (value === '0') return false;

      this.logger.warn('Invalid account cancellation cache value', { scope, id, value });
    } catch (error) {
      this.logger.warn('Failed to read account cancellation cache', { scope, id, error });
    }
    return undefined;
  }

  /** 写入短期状态；写入失败只降级为后续请求回源 Mongo。 */
  async set(scope: AccountCancellationCacheScope, id: string, active: boolean) {
    try {
      await this.redis.set({
        key: this.getKey(scope, id),
        value: active ? '1' : '0',
        ttlMs: ACCOUNT_CANCELLATION_CACHE_TTL_MS
      });
    } catch (error) {
      this.logger.warn('Failed to write account cancellation cache', {
        scope,
        id,
        active,
        error
      });
    }
  }

  /** 批量刷新同一作用域的状态；空集合不访问 Redis。 */
  setMany = async ({
    scope,
    ids,
    active
  }: {
    scope: AccountCancellationCacheScope;
    ids: readonly string[];
    active: boolean;
  }) => {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    await Promise.all(uniqueIds.map((id) => this.set(scope, id, active)));
  };

  /** 删除状态 marker；删除失败保持 active 语义，后续 miss 会回源 Mongo。 */
  async clear(scope: AccountCancellationCacheScope, id: string) {
    try {
      await this.redis.delete(this.getKey(scope, id));
    } catch (error) {
      this.logger.warn('Failed to clear account cancellation cache', { scope, id, error });
    }
  }

  clearMany = async ({
    scope,
    ids
  }: {
    scope: AccountCancellationCacheScope;
    ids: readonly string[];
  }) => {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    await Promise.all(uniqueIds.map((id) => this.clear(scope, id)));
  };
}

export const accountCancellationCache = new AccountCancellationCache();
