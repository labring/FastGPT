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
import type { Model, Mongoose } from '@fastgpt/service/common/mongo';

vi.stubEnv('NODE_ENV', 'test');

loadVectorDBEnv({ envFileNames: ['.env.test.local'] });

const initializedTestModels = new WeakMap<Mongoose, WeakSet<Model<any>>>();

/**
 * 为隔离测试库显式创建所有已声明索引并等待就绪。
 *
 * 生产连接固定关闭 `autoIndex`，且 `ensureMongoIndexes` 在 `NODE_ENV === 'test'` 跳过；
 * 由共享测试装配层显式补建未禁用 schema 级 `autoIndex: false` 的模型索引，并同时覆盖
 * `beforeAll` 之后延迟加载的模型，确保唯一键/TTL 等数据库约束在用例执行前已生效。
 */
const ensureTestMongoIndexes = async (clients: readonly Mongoose[]) => {
  const tasks: Promise<unknown>[] = [];

  for (const client of clients) {
    if (client.connection.readyState !== 1) continue;

    let synced = initializedTestModels.get(client);
    if (!synced) {
      synced = new WeakSet<Model<any>>();
      initializedTestModels.set(client, synced);
    }

    for (const model of Object.values(client.models)) {
      if (synced.has(model)) continue;
      if (model.schema.get('autoIndex') === false) continue;

      synced.add(model);
      tasks.push(
        model.createIndexes().catch((error) => {
          synced!.delete(model);
          throw error;
        })
      );
    }
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
};

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
    logWriteUrl: process.env.MONGODB_LOG_URI
  });
  const uniqueMongoClients = Array.from(new Set([connectionMongo, connectionLogMongo]));
  for (const client of uniqueMongoClients) {
    await connectMongo({ db: client, url: mongoUri });
    // 仅在隔离测试库连接后恢复连接级 autoIndex（生产始终保持 autoIndex: false），
    // 以兼容用例内动态 import 的延迟模型；schema 级显式 autoIndex: false 仍会被 Mongoose 尊重。
    client.set('autoIndex', true);
  }
  await ensureTestMongoIndexes(uniqueMongoClients);

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
  // shared 模式下 connectionLogMongo 与 connectionMongo 指向同一物理实例，按去重后的句柄清理。
  const uniqueMongoClients = Array.from(
    new Set([connectionMongo, connectionLogMongo].filter(Boolean))
  );
  for (const client of uniqueMongoClients) {
    await client.connection.db?.dropDatabase();
  }
  for (const client of uniqueMongoClients) {
    await client.disconnect();
  }
});

beforeEach(async () => {
  global.agentUserTmbIds = global.agentUserTmbIds ?? new Set();
  const uniqueMongoClients = Array.from(
    new Set([connectionMongo, connectionLogMongo].filter(Boolean))
  );
  await ensureTestMongoIndexes(uniqueMongoClients);
  // await connectMongo({ db: connectionMongo, url: inject('MONGODB_URI') });
  // await connectMongo({ db: connectionLogMongo, url: inject('MONGODB_URI') });

  onTestFinished(async () => {
    clean();

    try {
      const uniqueMongoClients = Array.from(
        new Set([connectionMongo, connectionLogMongo].filter(Boolean))
      );
      await Promise.all(uniqueMongoClients.map((client) => clearMongoCollections(client)));
    } catch (error) {
      // Ignore errors during cleanup
      console.warn('Error during test cleanup:', error);
    }
  });
});
