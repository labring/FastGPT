import '@test/mocks/common/mongo';
import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { connectionLogMongo, connectionMongo } from '@fastgpt/service/common/mongo';
import {
  configureRedisRuntime,
  closeRedisRuntime,
  getRedisRuntime
} from '@fastgpt/dal/redis/runtime';
import { initGlobalVariables } from '@/service/common/system';
import setupModels from '@test/setupModels';
import { afterAll, beforeAll, inject } from 'vitest';

configureRedisRuntime({
  redisUrl: process.env.REDIS_URL ?? 'redis://default:mypassword@localhost:6379/15'
});

/**
 * Sandbox 专用 integration setup。
 *
 * Mongo 使用随机测试数据库；Redis 则连接 dev 实例的隔离 DB，确保 lifecycle lease 和
 * preview session 都经过真实 Redis 命令，而不是通用单测 setup 的内存实现。
 */
beforeAll(async () => {
  await getRedisRuntime().checkHealth();
  await connectMongo({ db: connectionMongo, url: inject('MONGODB_URI') });
  await connectMongo({ db: connectionLogMongo, url: inject('MONGODB_URI') });

  initGlobalVariables();
  global.systemEnv = {} as typeof global.systemEnv;
  global.feConfigs = { isPlus: false } as typeof global.feConfigs;
  await setupModels();
});

afterAll(async () => {
  await connectionMongo.connection.db?.dropDatabase();
  await connectionLogMongo.connection.db?.dropDatabase();
  await connectionMongo.disconnect();
  await connectionLogMongo.disconnect();
  await closeRedisRuntime();
});
