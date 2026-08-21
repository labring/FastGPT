import { createRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';

export type SuccessMarkerParams = {
  scope: string;
  segments: readonly (string | number)[];
};

export type SuccessMarkerCacheOptions = {
  redis?: RedisCacheAdapter;
};

/**
 * 通用操作成功标记。
 *
 * 标记只用于减少已经成功的幂等操作，不承担事实存储职责。默认永久保存；调用方也可以
 * 为短期结果指定 TTL。Redis 故障的降级策略由业务接口层决定。
 */
export class SuccessMarkerCache {
  private readonly redis: RedisCacheAdapter;

  constructor({ redis = redisCacheAdapter }: SuccessMarkerCacheOptions = {}) {
    this.redis = redis;
  }

  private getKey({ scope, segments }: SuccessMarkerParams) {
    return createRedisLogicalKey({
      namespace: 'success-marker',
      version: 1,
      segments: [scope, ...segments]
    });
  }

  async has(params: SuccessMarkerParams): Promise<boolean> {
    return (await this.redis.get(this.getKey(params))) === '1';
  }

  mark({ params, ttlMs }: { params: SuccessMarkerParams; ttlMs?: number }): Promise<void> {
    return this.redis.set({
      key: this.getKey(params),
      value: '1',
      ttlMs
    });
  }

  clear(params: SuccessMarkerParams): Promise<boolean> {
    return this.redis.delete(this.getKey(params));
  }
}

export const successMarkerCache = new SuccessMarkerCache();
