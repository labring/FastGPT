import { createDefaultInstanceConfig } from '@test/utils/instanceConfigSnapshot';
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
  const uniqueMongoClients = Array.from(new Set([connectionMongo, connectionLogMongo]));
  for (const client of uniqueMongoClients) {
    await connectMongo({ db: client, url: inject('MONGODB_URI') });
    client.set('autoIndex', true);
  }
  const modelsToIndex = Array.from(
    new Set(uniqueMongoClients.flatMap((client) => Object.values(client.models)))
  ).filter((model) => model.schema.get('autoIndex') !== false);
  await Promise.all(modelsToIndex.map((model) => model.createIndexes()));

  initGlobalVariables();
  global.agentUserTmbIds = new Set();
  global.systemInstanceConfig = createDefaultInstanceConfig();
  await setupModels();
});

afterAll(async () => {
  const uniqueMongoClients = Array.from(new Set([connectionMongo, connectionLogMongo]));
  for (const client of uniqueMongoClients) {
    await client.connection.db?.dropDatabase();
  }
  for (const client of uniqueMongoClients) {
    await client.disconnect();
  }
  await closeRedisRuntime();
});
