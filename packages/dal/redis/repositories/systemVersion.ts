import { randomUUID } from 'node:crypto';
import {
  asRedisLogicalKey,
  redisRepositoryAdapter,
  type RedisLogicalKey,
  type RedisStoreAdapter
} from '../adapter';

const SYSTEM_VERSION_PREFIX = 'VERSION_KEY:';
const SYSTEM_VERSION_SCAN_BATCH_SIZE = 100;

export type SystemVersionRepositoryDependencies = {
  redis?: Pick<RedisStoreAdapter, 'deleteMany' | 'getOrSet' | 'iterateByPrefix' | 'set'>;
  createVersion?: () => string;
};

/**
 * 创建 System Version Repository。
 *
 * Repository 保持历史永久 key 和 UUID value；首次读取使用单条 SET NX GET 原子初始化。
 * wildcard refresh 会扫描并删除指定 base key 下的全部子 key，但不会删除 base key 本身。
 * Redis 是版本一致性的事实来源，所有错误均向上传播。
 */
export const createSystemVersionRepository = ({
  redis = redisRepositoryAdapter,
  createVersion = randomUUID
}: SystemVersionRepositoryDependencies = {}) => {
  const getBaseKey = (key: string) => asRedisLogicalKey(`${SYSTEM_VERSION_PREFIX}${key}`);
  const getKey = ({ key, id }: { key: string; id?: string }) =>
    id ? asRedisLogicalKey(`${getBaseKey(key)}:${id}`) : getBaseKey(key);

  return {
    /** 返回已有版本；key 不存在时原子写入并返回新的永久版本。 */
    getOrInitialize: ({ key, id }: { key: string; id?: string }) =>
      redis.getOrSet({
        key: getKey({ key, id }),
        value: createVersion()
      }),
    /** 刷新单个版本，或在 id='*' 时只删除该 base key 下的全部子版本。 */
    refresh: async ({ key, id }: { key: string; id?: string | '*' }) => {
      if (id !== '*') {
        await redis.set({
          key: getKey({ key, id }),
          value: createVersion()
        });
        return;
      }

      // 先完成遍历再删除，避免修改 keyspace 导致 SCAN 游标漏过尚未返回的子 key。
      const childKeys: RedisLogicalKey[] = [];
      for await (const keys of redis.iterateByPrefix({
        prefix: getBaseKey(key),
        batchSize: SYSTEM_VERSION_SCAN_BATCH_SIZE
      })) {
        childKeys.push(...keys);
      }
      if (childKeys.length > 0) {
        await redis.deleteMany(childKeys);
      }
    }
  };
};

export const systemVersionRepository = createSystemVersionRepository();

export type SystemVersionRepository = ReturnType<typeof createSystemVersionRepository>;
