import { createRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import type { RedisCacheLogger } from '../types';

/** 注销状态缓存 TTL；读取和生命周期写入都会刷新过期时间。 */
export const ACCOUNT_CANCELLATION_CACHE_TTL_MS = 5 * 60 * 1000;

export type AccountCancellationCacheScope = 'team' | 'user';

export type AccountCancellationCacheOptions = {
  redis?: RedisCacheAdapter;
  logger?: RedisCacheLogger<'warn'>;
};

const noopLogger: RedisCacheLogger<'warn'> = {
  warn: () => undefined
};

const GET_AND_REFRESH_TTL_SCRIPT = `
local value = redis.call("get", KEYS[1])
if value then
  redis.call("pexpire", KEYS[1], ARGV[1])
end
return value
`;

/**
 * 鉴权注销状态 Cache。
 *
 * Cache 保存 active 和 inactive 状态。读取失败统一返回 miss，由 Service 回源 Mongo；
 * 读取命中时在同一个 Lua 脚本中刷新 TTL，避免旧读值覆盖并发的生命周期更新。
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
      segments: [scope, id]
    });

  /** 返回缓存状态并续期；Redis miss、异常或损坏值均返回 undefined，交由调用方回源。 */
  async get(scope: AccountCancellationCacheScope, id: string): Promise<boolean | undefined> {
    try {
      const value = await this.redis.evalScript({
        script: GET_AND_REFRESH_TTL_SCRIPT,
        keys: [this.getKey(scope, id)],
        args: [ACCOUNT_CANCELLATION_CACHE_TTL_MS]
      });
      if (value === null || value === false) return undefined;
      if (value === '1') return true;
      if (value === '0') return false;

      this.logger.warn('Invalid account cancellation cache value', { scope, id, value });
    } catch (error) {
      this.logger.warn('Failed to read account cancellation cache', { scope, id, error });
    }
    return undefined;
  }

  /** 写入 0/1 状态并设置 5 分钟 TTL。 */
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
      throw error;
    }
  }

  /** 仅在 Cache miss 时初始化状态，避免回源旧结果覆盖生命周期写入。 */
  async setIfAbsent(
    scope: AccountCancellationCacheScope,
    id: string,
    active: boolean
  ): Promise<boolean> {
    try {
      return await this.redis.setIfAbsent({
        key: this.getKey(scope, id),
        value: active ? '1' : '0',
        ttlSeconds: ACCOUNT_CANCELLATION_CACHE_TTL_MS / 1000
      });
    } catch (error) {
      this.logger.warn('Failed to initialize account cancellation cache', {
        scope,
        id,
        active,
        error
      });
      return false;
    }
  }

  /** 清理一组状态 marker；生命周期写入失败时用 miss 触发 Mongo 回源。 */
  async clearMany({
    scope,
    ids
  }: {
    scope: AccountCancellationCacheScope;
    ids: readonly string[];
  }) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return;

    try {
      await this.redis.deleteMany(uniqueIds.map((id) => this.getKey(scope, id)));
    } catch (error) {
      this.logger.warn('Failed to clear account cancellation cache', {
        scope,
        ids: uniqueIds,
        error
      });
      throw error;
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
}

export const accountCancellationCache = new AccountCancellationCache();
