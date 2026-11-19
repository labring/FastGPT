import './mocks';
import { getSystemConfigRuntimeState } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';

import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { configureMongoDalRuntime } from '@fastgpt/service/common/mongo/dalRuntime';
import { closeDbRuntime } from '@fastgpt/dal/db/runtime';
import { initGlobalVariables } from '@/service/common/system';
import { afterAll, beforeAll, beforeEach, inject, onTestFinished, vi } from 'vitest';
import setupModels from './setupModels';
import { clean } from './datas/users';
import { connectionLogMongo, connectionMongo } from '@fastgpt/service/common/mongo';
import { loadVectorDBEnv } from './utils/env';
import type { Mongoose } from '@fastgpt/service/common/mongo';

vi.stubEnv('NODE_ENV', 'test');

loadVectorDBEnv({ envFileNames: ['.env.test.local'] });

/**
 * Clears documents while keeping collections and indexes warm inside one test file.
 * File-level DB names are already isolated, so per-case cleanup does not need to
 * drop the whole database and force MongoDB to rebuild collection metadata.
 */
const clearMongoCollections = async (db: Mongoose | undefined) => {
  const database = db?.connection.db;
  if (!database) return;

  const collections = await database.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

beforeAll(async () => {
  const mongoUri = inject('MONGODB_URI');
  // 直接写入进程级测试基线，避免单测在 afterEach 调用 vi.unstubAllEnvs() 时意外清空 MONGODB_URI
  process.env.MONGODB_URI = mongoUri;
  configureMongoDalRuntime({
    mainWriteUrl: mongoUri,
    logWriteUrl: process.env.MONGODB_LOG_URI,
    // 单机/测试默认跳过底层 startSession 同时保留 DbSession.afterCommit 行为（显式事务契约测试可覆盖此配置）
    transactionRunner: async ({ execute }) => execute(undefined)
  });
  await connectMongo({ db: connectionMongo, url: mongoUri });
  await connectMongo({ db: connectionLogMongo, url: mongoUri });

  initGlobalVariables();
  global.agentUserTmbIds = new Set();
  global.systemInstanceConfig = resolveSystemInstanceConfig();
  getSystemConfigRuntimeState().frontendContext = {};

  global.feConfigs = {
    limit: { uploadFileMaxAmount: 1000, uploadFileMaxSize: 1000 },
    isPlus: false
  } as any;
  await setupModels();
});

afterAll(async () => {
  await closeDbRuntime();
  await connectionMongo?.connection.db?.dropDatabase();
  await connectionLogMongo?.connection.db?.dropDatabase();
  await connectionMongo?.disconnect();
  await connectionLogMongo?.disconnect();
});

beforeEach(async () => {
  global.agentUserTmbIds = global.agentUserTmbIds ?? new Set();
  // await connectMongo({ db: connectionMongo, url: inject('MONGODB_URI') });
  // await connectMongo({ db: connectionLogMongo, url: inject('MONGODB_URI') });

  onTestFinished(async () => {
    clean();

    try {
      await Promise.all([
        clearMongoCollections(connectionMongo),
        clearMongoCollections(connectionLogMongo)
      ]);
    } catch (error) {
      // Ignore errors during cleanup
      console.warn('Error during test cleanup:', error);
    }
  });
});
