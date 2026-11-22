import { vi } from 'vitest';
import { randomUUID } from 'crypto';
import type { Mongoose } from '@fastgpt/service/common/mongo';

const fileDbPrefix = `fastgpt_test_${process.env.VITEST_WORKER_ID ?? '0'}_${randomUUID().replaceAll(
  '-',
  ''
)}`;
const dbNames = new WeakMap<Mongoose, string>();
const connectPromises = new WeakMap<Mongoose, Promise<Mongoose>>();
let dbSeq = 0;

const getDbName = (db: Mongoose) => {
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
      // 测试库在本机单节点副本集上，无持久化要求。副本集隐含默认写关注是
      // `w:"majority"` + `j:true`，每次写入都要等 journal fsync；慢盘上单次写入可达
      // 25–120ms，顺序写较多的用例会因此撞上默认 30s 的 test/hook 超时。这里降到
      // `w:1, j:false`：仍由主节点确认、读己之写语义不变，只是不等待落盘/多数派，
      // 避免用放大超时掩盖真实的写延迟。
      writeConcern: { w: 1, j: false },
      serverSelectionTimeoutMS: 10000
    });
    // UUID 已保证首次连接的数据库独立；连接后删库会与 Mongoose 自动建表竞争。
    // 用例间文档清理和文件结束后的删库由 test/setup.ts 负责。
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
