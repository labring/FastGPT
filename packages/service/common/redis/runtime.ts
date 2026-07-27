import {
  closeRedisRuntime,
  configureRedisRuntime,
  getConfiguredRedisRuntime,
  type RedisClient,
  type RedisRuntime
} from '@fastgpt/dal/redis/runtime';
import { serviceEnv } from '../../env';
import { getLogger, LogCategories } from '../logger';

const logger = getLogger(LogCategories.INFRA.REDIS);

/**
 * 获取 service 进程使用的默认 Redis Runtime。
 *
 * 该迁移期绑定层只负责把 serviceEnv 和 logger 注入 DAL。DAL 本身不读取应用环境；相同
 * 配置在 Next.js 热重载时复用，配置变更必须先显式关闭旧 Runtime。
 */
export const getRedisRuntime = (): RedisRuntime =>
  configureRedisRuntime({
    redisUrl: serviceEnv.REDIS_URL,
    logger,
    existingCommandClient: global.redisClient ?? undefined
  });

/** @deprecated 业务模块应迁移到对应 Redis Repository，不再直接获取 client。 */
export const getGlobalRedisConnection = () => {
  const client = getRedisRuntime().getLegacyCommandConnection();
  global.redisClient = client;
  return client;
};

/** @internal 仅供迁移期 adapter/Stream 实现使用，禁止普通业务模块依赖。 */
export const getPhysicalRedisConnection = () => getRedisRuntime().getCommandConnection();

export const createBlockingRedisConnection = () => getRedisRuntime().createBlockingConnection();
export const createQueueRedisConnection = () => getRedisRuntime().createQueueConnection();
export const createWorkerRedisConnection = () => getRedisRuntime().createWorkerConnection();
export const getRedisConnectionSnapshot = () => getRedisRuntime().getConnectionSnapshot();
export const checkRedisHealth = () => getRedisRuntime().checkHealth();

/**
 * 关闭 DAL Runtime 并清理迁移期 legacy client。
 * 未配置 Runtime 时只处理热重载遗留的孤立 client，不会为了 close 创建新连接。
 */
export const closeRedisConnections = async (): Promise<void> => {
  const runtime = getConfiguredRedisRuntime();
  if (!runtime) {
    try {
      global.redisClient?.disconnect();
    } catch (error) {
      logger.warn('Orphaned Redis client disconnect failed', { error });
    }
    global.redisClient = null;
    return;
  }

  await closeRedisRuntime();
  global.redisClient = null;
};

export type { RedisClient };
