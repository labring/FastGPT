import { randomUUID } from 'node:crypto';
import {
  asRedisLogicalKey,
  redisCacheAdapter,
  type RedisLogicalKey,
  type RedisCacheAdapter
} from '../adapter';

const SYSTEM_VERSION_PREFIX = 'VERSION_KEY:';
const SYSTEM_VERSION_SCAN_BATCH_SIZE = 100;

export type SystemVersionCacheOptions = {
  redis?: Pick<RedisCacheAdapter, 'deleteMany' | 'getOrSet' | 'iterateByPrefix' | 'set'>;
  createVersion?: () => string;
};

/**
 * System Version Cache。
 *
 * Cache 保持历史永久 key 和 UUID value；首次读取使用单条 SET NX GET 原子初始化。
 * wildcard refresh 会扫描并删除指定 base key 下的全部子 key，但不会删除 base key 本身。
 * Redis 是版本一致性的事实来源，所有错误均向上传播。
 */
export class SystemVersionCache {
  private readonly redis: Pick<
    RedisCacheAdapter,
    'deleteMany' | 'getOrSet' | 'iterateByPrefix' | 'set'
  >;
  private readonly createVersion: () => string;

  constructor({
    redis = redisCacheAdapter,
    createVersion = randomUUID
  }: SystemVersionCacheOptions = {}) {
    this.redis = redis;
    this.createVersion = createVersion;
  }

  private getBaseKey = (key: string) => asRedisLogicalKey(`${SYSTEM_VERSION_PREFIX}${key}`);
  private getKey = ({ key, id }: { key: string; id?: string }) =>
    id ? asRedisLogicalKey(`${this.getBaseKey(key)}:${id}`) : this.getBaseKey(key);

  /** 返回已有版本；key 不存在时原子写入并返回新的永久版本。 */
  getOrInitialize = ({ key, id }: { key: string; id?: string }) =>
    this.redis.getOrSet({
      key: this.getKey({ key, id }),
      value: this.createVersion()
    });

  /** 刷新单个版本，或在 id='*' 时只删除该 base key 下的全部子版本。 */
  async refresh({ key, id }: { key: string; id?: string | '*' }) {
    if (id !== '*') {
      await this.redis.set({
        key: this.getKey({ key, id }),
        value: this.createVersion()
      });
      return;
    }

    // 先完成遍历再删除，避免修改 keyspace 导致 SCAN 游标漏过尚未返回的子 key。
    const childKeys: RedisLogicalKey[] = [];
    for await (const keys of this.redis.iterateByPrefix({
      prefix: this.getBaseKey(key),
      batchSize: SYSTEM_VERSION_SCAN_BATCH_SIZE
    })) {
      childKeys.push(...keys);
    }
    if (childKeys.length > 0) {
      await this.redis.deleteMany(childKeys);
    }
  }
}

export const systemVersionCache = new SystemVersionCache();
