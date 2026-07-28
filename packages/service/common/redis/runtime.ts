import {
  closeRedisRuntime,
  configureRedisRuntime,
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
    logger
  });

export const createQueueRedisConnection = () => getRedisRuntime().createQueueConnection();
export const createWorkerRedisConnection = () => getRedisRuntime().createWorkerConnection();
export const checkRedisHealth = () => getRedisRuntime().checkHealth();

/**
 * 关闭 DAL Runtime。
 * 未配置 Runtime 时保持幂等，不会为了 close 创建新连接。
 */
export const closeRedisConnections = async (): Promise<void> => {
  await closeRedisRuntime();
};
