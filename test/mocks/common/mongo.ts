import { vi } from 'vitest';
import { randomUUID } from 'crypto';
import type { Mongoose } from '@fastgpt/service/common/mongo';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { connection } from '@fastgpt/service/common/dal/mongo/connection';

const fileDbPrefix = `fastgpt_test_${process.env.VITEST_WORKER_ID ?? '0'}_${randomUUID().replaceAll(
  '-',
  ''
)}`;
const dbNames = new WeakMap<Mongoose, string>();
const connectPromises = new WeakMap<Mongoose, Promise<Mongoose>>();
let dbSeq = 0;

const getDbName = (db: Mongoose) => {
  // 主业务库：DAL 连接实例与 connectionMongo 共享同一测试库，
  // 保证迁移期旧 Model 写入的数据可以被 DAL Repository 读到（生产环境两者指向同一数据库）。
  if (db === connection.client) {
    return getDbName(connectionMongo);
  }

  const existing = dbNames.get(db);
  if (existing) return existing;

  const dbName = `${fileDbPrefix}_${dbSeq++}`;
  dbNames.set(db, dbName);
  return dbName;
};

const connectTestMongo = async (props: { db: Mongoose; url: string; connectedCb?: () => void }) => {
  const { db, url, connectedCb } = props;

  if (db.connection.readyState !== 0) {
    return db;
  }

  const connecting = connectPromises.get(db);
  if (connecting) return connecting;

  const promise = (async () => {
    await db.connect(url, {
      dbName: getDbName(db),
      maxPoolSize: 4,
      minPoolSize: 0,
      retryWrites: false,
      serverSelectionTimeoutMS: 10000
    });
    await db.connection.db?.dropDatabase();
    connectedCb?.();

    return db;
  })();

  connectPromises.set(db, promise);

  try {
    return await promise;
  } finally {
    connectPromises.delete(db);
  }
};

/**
 * Mock MongoDB connection for testing
 * Creates a stable, isolated database for each test file and Mongoose instance.
 */
vi.mock(import('@fastgpt/service/common/mongo/init'), async (importOriginal: any) => {
  const mod = await importOriginal();
  return {
    ...mod,
    connectMongo: async (props: { db: Mongoose; url: string; connectedCb?: () => void }) => {
      return connectTestMongo(props);
    }
  };
});

/**
 * Mock DAL 独立连接：复用同一套按测试文件/实例隔离的数据库分配，
 * 并让 DAL 连接实例与 connectionMongo 共享主业务库。
 */
vi.mock(import('@fastgpt/service/common/dal/mongo/connection'), async (importOriginal: any) => {
  const mod = await importOriginal();
  mod.connection.connect = async (url: string) =>
    connectTestMongo({ db: mod.connection.client, url });
  return mod;
});

/**
 * Mock mongoSessionRun to avoid transaction issues in tests
 * MongoDB transactions require replica set, which may not be available in test environment
 */
vi.mock(import('@fastgpt/service/common/mongo/sessionRun'), async () => {
  const runWithoutTransaction = async (fn: (session: any) => Promise<unknown>) => {
    // Execute the function without a real session
    return await fn(null as any);
  };

  return {
    mongoSessionRun: vi.fn(runWithoutTransaction)
  };
});
