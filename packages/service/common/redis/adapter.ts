import { createRedisStoreAdapter, type RedisStoreAdapter } from '@fastgpt/dal/redis/adapter';
import { getRedisRuntime } from './runtime';

/**
 * 为尚未迁入 DAL 的 service/pro Repository 绑定默认 Redis Runtime。
 * DAL-R2/R2P 完成后，Repository 将在各自 DAL 所有权目录直接创建或注入 adapter。
 */
export const redisStoreAdapter = createRedisStoreAdapter({
  getCommandClient: () => getRedisRuntime().getCommandConnection()
});

export { createRedisStoreAdapter };
export type { RedisStoreAdapter };
