import { randomUUID } from 'node:crypto';
import { closeDbRuntime } from '@fastgpt/dal/db/runtime';
import { Mongoose, Schema } from 'mongoose';
import { afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_index_startup',
    MONGODB_LOG_URI: undefined as string | undefined,
    DB_MAX_LINK: 10,
    SYNC_INDEX: false
  },
  sync: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('@fastgpt/service/env', () => ({ serviceEnv: mocks.env }));
vi.mock('@fastgpt/service/common/mongo/indexManager', () => ({
  MongoIndexManager: { syncModelIndexes: mocks.sync }
}));
vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { INFRA: { MONGO: 'mongo' } }
}));
vi.mock('@fastgpt/service/common/profiling', () => ({
  isProfiling: () => false,
  recordMongoOperation: vi.fn()
}));

const buildIsolatedMongoUri = (prefix: string): string => {
  const url = new URL(inject('MONGODB_URI'));
  url.pathname = `/${prefix}_${randomUUID().replaceAll('-', '')}`;
  return url.toString();
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.sync.mockResolvedValue(undefined);
  mocks.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/unused_index_startup';
  mocks.env.MONGODB_LOG_URI = undefined;
  mocks.env.DB_MAX_LINK = 10;
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PHASE', undefined);
  vi.stubEnv('SYNC_INDEX', 'false');
  vi.stubEnv('MONGODB_LOG_URI', '');
  // 只验证启动委派，不建立数据库连接。
  vi.stubGlobal('mongodb', new Mongoose());
  vi.stubGlobal('mongodbLog', new Mongoose());
});

afterEach(async () => {
  await closeDbRuntime();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(['getMongoModel', 'getMongoLogModel'] as const)('%s index startup', (factory) => {
  const loadModel = async () => {
    const mongo = await import('@fastgpt/service/common/mongo');
    return mongo[factory](
      `IndexStartup${randomUUID().replaceAll('-', '')}`,
      new Schema({ value: String }, { autoIndex: false, autoCreate: false })
    );
  };

  it('maintains indexes even when the retired switch is false', async () => {
    const model = await loadModel();
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith({ model, logger: mocks.logger });
  });

  it.each(['test', 'build', 'missing database'])('skips maintenance during %s', async (reason) => {
    if (reason === 'test') vi.stubEnv('NODE_ENV', 'test');
    if (reason === 'build') vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    if (reason === 'missing database') mocks.env.MONGODB_URI = '';

    await loadModel();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('reports maintenance failures with the affected collection', async () => {
    const error = new Error('index creation failed');
    mocks.sync.mockRejectedValueOnce(error);
    const model = await loadModel();

    expect(mocks.logger.error).toHaveBeenCalledWith('Failed to ensure MongoDB indexes', {
      modelName: model.modelName,
      collectionName: model.collection.collectionName,
      error
    });
  });
});

describe('Mongo shared vs separate pool topology and DAL startup DDL index sync', () => {
  it('aliases connectionLogMongo to connectionMongo (single pool) in shared mode when MONGODB_LOG_URI is omitted or equals MONGODB_URI', async () => {
    // 1. 未配置 MONGODB_LOG_URI（默认 shared 模式）
    mocks.env.MONGODB_LOG_URI = undefined;
    const sharedDefault = await import('@fastgpt/service/common/mongo');
    expect(sharedDefault.hasSeparateMongoLogUri).toBe(false);
    expect(sharedDefault.connectionLogMongo).toBe(sharedDefault.connectionMongo);
    expect(sharedDefault.MONGO_LOG_URL).toBe(sharedDefault.MONGO_URL);

    const { configureMongoDalRuntime: configureDefault } =
      await import('@fastgpt/service/common/mongo/dalRuntime');
    const defaultRuntime = configureDefault({
      mainWriteUrl: mocks.env.MONGODB_URI,
      logWriteUrl: undefined
    });
    expect(defaultRuntime.logMode).toBe('shared');
    await closeDbRuntime();

    // 2. MONGODB_LOG_URI 与 MONGODB_URI 相同（含首尾空白）也必须保持单池 shared 模式
    vi.resetModules();
    mocks.env.MONGODB_LOG_URI = `  ${mocks.env.MONGODB_URI}  `;
    const sharedSameUri = await import('@fastgpt/service/common/mongo');
    expect(sharedSameUri.hasSeparateMongoLogUri).toBe(false);
    expect(sharedSameUri.connectionLogMongo).toBe(sharedSameUri.connectionMongo);

    const { configureMongoDalRuntime: configureSameUri } =
      await import('@fastgpt/service/common/mongo/dalRuntime');
    const sameUriRuntime = configureSameUri({
      mainWriteUrl: mocks.env.MONGODB_URI,
      logWriteUrl: mocks.env.MONGODB_LOG_URI
    });
    expect(sameUriRuntime.logMode).toBe('shared');
  });

  it('allocates a dedicated connectionLogMongo instance (two pools) when MONGODB_LOG_URI differs from MONGODB_URI', async () => {
    mocks.env.MONGODB_LOG_URI = 'mongodb://127.0.0.1:27017/unused_index_startup_log';
    const separateMod = await import('@fastgpt/service/common/mongo');
    expect(separateMod.hasSeparateMongoLogUri).toBe(true);
    expect(separateMod.connectionLogMongo).not.toBe(separateMod.connectionMongo);
    expect(separateMod.MONGO_LOG_URL).toBe('mongodb://127.0.0.1:27017/unused_index_startup_log');

    const { configureMongoDalRuntime } = await import('@fastgpt/service/common/mongo/dalRuntime');
    const separateRuntime = configureMongoDalRuntime({
      mainWriteUrl: mocks.env.MONGODB_URI,
      logWriteUrl: mocks.env.MONGODB_LOG_URI
    });
    expect(separateRuntime.logMode).toBe('separate');
  });

  it('deduplicates concurrent connectMongo calls on the same shared Mongoose instance', async () => {
    const { connectMongo } = await vi.importActual<
      typeof import('@fastgpt/service/common/mongo/init')
    >('@fastgpt/service/common/mongo/init');

    const sharedDb = new Mongoose();
    let resolveConnect!: () => void;
    const connectGate = new Promise<void>((resolve) => {
      resolveConnect = resolve;
    });

    const connectSpy = vi.spyOn(sharedDb, 'connect').mockImplementation(async () => {
      await connectGate;
      return sharedDb;
    });

    const first = connectMongo({
      db: sharedDb,
      url: 'mongodb://127.0.0.1:27017/dedupe_shared_pool',
      syncDalIndexes: false
    });
    const second = connectMongo({
      db: sharedDb,
      url: 'mongodb://127.0.0.1:27017/dedupe_shared_pool',
      syncDalIndexes: false
    });

    resolveConnect();
    const [resA, resB] = await Promise.all([first, second]);

    expect(resA).toBe(sharedDb);
    expect(resB).toBe(sharedDb);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(sharedDb.get('autoIndex')).toBe(false);
  });

  it('syncs coreMongoCollections (app_registrations) indexes via dedicated DDL connection after connectMongo succeeds and skips during test/build', async () => {
    const { connectMongo } = await vi.importActual<
      typeof import('@fastgpt/service/common/mongo/init')
    >('@fastgpt/service/common/mongo/init');

    // 1. NODE_ENV=test / NEXT_PHASE=phase-production-build 默认跳过后台 DAL 索引同步
    for (const envMode of ['test', 'build'] as const) {
      vi.stubEnv('NODE_ENV', envMode === 'test' ? 'test' : 'production');
      vi.stubEnv('NEXT_PHASE', envMode === 'build' ? 'phase-production-build' : undefined);

      const skippedDb = new Mongoose();
      const skippedUri = buildIsolatedMongoUri(`dal_skip_${envMode}`);
      try {
        await connectMongo({ db: skippedDb, url: skippedUri });
        expect(skippedDb.get('autoIndex')).toBe(false);
        // 等待微任务刷新，确认不会后台创建 app_registrations 集合及索引
        await new Promise((resolve) => setTimeout(resolve, 100));
        const collections = await skippedDb.connection
          .db!.listCollections({
            name: 'app_registrations'
          })
          .toArray();
        expect(collections).toEqual([]);
      } finally {
        await skippedDb.connection.db?.dropDatabase().catch(() => undefined);
        await skippedDb.disconnect().catch(() => undefined);
      }
    }

    // 2. 生产启动（NODE_ENV=production，未显式传 syncDalIndexes）下连接主库自动通过独立 DDL 连接创建 app_registrations.teamId_1
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', undefined);
    const prodUri = buildIsolatedMongoUri('dal_sync_prod');
    mocks.env.MONGODB_URI = prodUri;
    const mongoMod = await import('@fastgpt/service/common/mongo');
    const prodDb = mongoMod.connectionMongo;
    try {
      await connectMongo({ db: prodDb, url: prodUri });
      expect(prodDb.get('autoIndex')).toBe(false);

      await vi.waitFor(
        async () => {
          const indexes = await prodDb.connection.db!.collection('app_registrations').indexes();
          expect(indexes.map((idx) => idx.name)).toContain('teamId_1');
        },
        { timeout: 10_000 }
      );
    } finally {
      await prodDb.connection.db?.dropDatabase().catch(() => undefined);
      await prodDb.disconnect().catch(() => undefined);
    }

    // 3. 测试环境显式传 syncDalIndexes: true 时，即使业务连接 autoIndex=false，也通过独立 DDL 连接创建 app_registrations.teamId_1
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PHASE', undefined);

    const activeDb = new Mongoose();
    const activeUri = buildIsolatedMongoUri('dal_sync_active');
    try {
      await connectMongo({
        db: activeDb,
        url: activeUri,
        syncDalIndexes: true
      });
      expect(activeDb.get('autoIndex')).toBe(false);

      await vi.waitFor(
        async () => {
          const indexes = await activeDb.connection.db!.collection('app_registrations').indexes();
          expect(indexes.map((idx) => idx.name)).toContain('teamId_1');
        },
        { timeout: 10_000 }
      );
    } finally {
      await activeDb.connection.db?.dropDatabase().catch(() => undefined);
      await activeDb.disconnect().catch(() => undefined);
    }
  });
});
