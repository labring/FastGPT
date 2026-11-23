import { randomUUID } from 'node:crypto';
import {
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  sql,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult
} from 'kysely';
import { Mongoose, type Model } from 'mongoose';
import { createPool } from 'mysql2';
import { DbConfigurationError } from './errors';
import type { MongoCollectionDefinition } from './mongo/collection';
import { createMongoRuntimeDeps } from './mongo/runtime';
import { createOceanBaseRuntimeDeps } from './oceanbase/runtime';
import { closeDbRuntime, configureDbRuntime, getDbRuntime } from './runtime';
import type { DbDatasource, DbDialect, DbLogMode } from './types';

export type MongoTestHarness = {
  client: Mongoose;
  logClient?: Mongoose;
  getModel: <TDoc>(collection: MongoCollectionDefinition<TDoc>) => Model<TDoc>;
  /** 绕过 Mongoose Schema 校验直接写入原始文档，用于契约测试验证历史空值与脏数据兜底。 */
  insertRawRow: (params: {
    collection: string;
    doc: Record<string, unknown>;
    datasource?: DbDatasource;
  }) => Promise<void>;
  clearAll: () => Promise<void>;
  close: () => Promise<void>;
};

export type OceanBaseTestHarness = {
  db: Kysely<any>;
  logDb: Kysely<any>;
  /** 使用无表级 DDL 锁的 `DELETE FROM` 清理目标表，避免 OceanBase 元数据锁争用。 */
  clearAll: () => Promise<void>;
  insertRawRow: (params: {
    table: string;
    row: Record<string, unknown>;
    datasource?: DbDatasource;
  }) => Promise<void>;
  close: () => Promise<void>;
};

const getWorkerToken = (): string => {
  const raw = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '0';
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '');
  return cleaned.length > 0 ? cleaned : '0';
};

/** 生成按 Vitest Worker 隔离的随机数据库名，防止并发测试互清或锁冲突。 */
export const buildWorkerIsolatedDatabaseName = (prefix: string): string => {
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  return `${safePrefix}_w${getWorkerToken()}_${suffix}`;
};

const withDatabaseNameInUrl = (rawUri: string, dbName: string): string => {
  const parsed = new URL(rawUri);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
};

const startMongoMemoryReplSetWithRetry = async (maxAttempts = 3) => {
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      if (!/already in use/i.test(msg) || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw lastError;
};

/**
 * 为 `@fastgpt/dal` 独立契约测试创建零业务依赖的 MongoDB 副本集沙盒，并注册 `DbRuntime`。
 */
export const createMongoTestHarness = async ({
  collections,
  logCollections = [],
  logMode = 'shared',
  uri
}: {
  collections: readonly MongoCollectionDefinition<any>[];
  logCollections?: readonly MongoCollectionDefinition<any>[];
  logMode?: DbLogMode;
  uri?: string;
}): Promise<MongoTestHarness> => {
  await closeDbRuntime();

  const externalUri = uri ?? process.env.FASTGPT_TEST_MONGODB_URI;
  const hasExternalUri = externalUri !== undefined && externalUri.trim().length > 0;
  let replSet: { stop: () => Promise<boolean> } | undefined;
  let mainClient: Mongoose | undefined;
  let logClient: Mongoose | undefined;

  try {
    const baseUri = await (async () => {
      if (hasExternalUri) {
        return externalUri.trim();
      }
      const started = await startMongoMemoryReplSetWithRetry();
      replSet = started;
      return started.getUri();
    })();

    const mainDbName = buildWorkerIsolatedDatabaseName('fg_dal_main');
    const logDbName =
      logMode === 'separate' ? buildWorkerIsolatedDatabaseName('fg_dal_log') : undefined;

    mainClient = new Mongoose();
    mainClient.set('strictQuery', 'throw');
    mainClient.set('autoIndex', false);
    await mainClient.connect(baseUri, { dbName: mainDbName });

    if (logDbName !== undefined) {
      logClient = new Mongoose();
      logClient.set('strictQuery', 'throw');
      logClient.set('autoIndex', false);
      await logClient.connect(baseUri, { dbName: logDbName });
    }

    const activeMainClient = mainClient;
    const activeLogClient = logClient;
    const mongoDeps = createMongoRuntimeDeps({
      getMainClient: () => activeMainClient,
      getLogClient: () => activeLogClient
    });

    const runtime = configureDbRuntime({
      dialect: 'mongo',
      mainWriteUrl: baseUri,
      ...(logDbName !== undefined ? { logWriteUrl: baseUri } : {}),
      ...mongoDeps
    });

    const activeCollections = [...collections, ...logCollections];
    const boundModels = activeCollections.map((col) =>
      runtime.bindMongoModel<any, Model<any>>(col)
    );
    for (const model of boundModels) {
      await model.createCollection().catch(() => undefined);
      await model.createIndexes().catch(() => undefined);
    }

    return {
      client: activeMainClient,
      logClient: activeLogClient,
      getModel: <TDoc>(collection: MongoCollectionDefinition<TDoc>) =>
        getDbRuntime().bindMongoModel<TDoc, Model<TDoc>>(collection),
      insertRawRow: async ({ collection, doc, datasource = 'main' }) => {
        const targetClient =
          datasource === 'log' && activeLogClient !== undefined
            ? activeLogClient
            : activeMainClient;
        const db = targetClient.connection.db;
        if (db === undefined) {
          throw new DbConfigurationError('Mongo test harness connection is not ready');
        }
        await db.collection(collection).insertOne(doc);
      },
      clearAll: async () => {
        for (const model of boundModels) {
          await model.deleteMany({});
        }
      },
      close: async () => {
        await closeDbRuntime();
        if (hasExternalUri) {
          await activeMainClient.connection.dropDatabase().catch(() => undefined);
          await activeLogClient?.connection.dropDatabase().catch(() => undefined);
        }
        await activeMainClient.disconnect().catch(() => undefined);
        await activeLogClient?.disconnect().catch(() => undefined);
        if (replSet !== undefined) {
          await replSet.stop();
        }
      }
    };
  } catch (error) {
    await closeDbRuntime().catch(() => undefined);
    await mainClient?.disconnect().catch(() => undefined);
    await logClient?.disconnect().catch(() => undefined);
    if (replSet !== undefined) {
      await replSet.stop().catch(() => undefined);
    }
    throw error;
  }
};

/**
 * 为真实 OceanBase（4.3+ / SeekDB）实例创建按 Worker 隔离的独立测试库并注册 `DbRuntime`。
 */
export const createOceanBaseTestHarness = async ({
  uri,
  tables,
  ddls = [],
  logMode = 'shared'
}: {
  uri: string;
  tables: readonly string[];
  ddls?: readonly string[];
  logMode?: DbLogMode;
}): Promise<OceanBaseTestHarness> => {
  await closeDbRuntime();

  const mainDbName = buildWorkerIsolatedDatabaseName('fg_ob_main');
  const logDbName =
    logMode === 'separate' ? buildWorkerIsolatedDatabaseName('fg_ob_log') : undefined;
  const adminPool = createPool({ uri, connectionLimit: 2 }).promise();

  try {
    await adminPool.query(
      `CREATE DATABASE IF NOT EXISTS \`${mainDbName}\` DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`
    );
    if (logDbName !== undefined) {
      await adminPool.query(
        `CREATE DATABASE IF NOT EXISTS \`${logDbName}\` DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`
      );
    }

    const mainWriteUrl = withDatabaseNameInUrl(uri, mainDbName);
    const logWriteUrl = logDbName !== undefined ? withDatabaseNameInUrl(uri, logDbName) : undefined;
    const deps = createOceanBaseRuntimeDeps({ mainWriteUrl, logWriteUrl });

    configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl,
      ...(logWriteUrl !== undefined ? { logWriteUrl } : {}),
      ...deps
    });

    const mainDb = deps.oceanBaseExecutorResolver({ datasource: 'main' });
    const logDb = deps.oceanBaseExecutorResolver({ datasource: 'log' });

    for (const ddl of ddls) {
      await sql.raw(ddl).execute(mainDb);
    }

    const clearTables = async (targetDb: Kysely<any>) => {
      for (const table of tables) {
        await sql
          .raw(`DELETE FROM \`${table}\``)
          .execute(targetDb)
          .catch(() => undefined);
      }
    };

    return {
      db: mainDb,
      logDb,
      clearAll: async () => {
        await clearTables(mainDb);
        if (logDb !== mainDb) {
          await clearTables(logDb);
        }
      },
      insertRawRow: async ({ table, row, datasource = 'main' }) => {
        const target = datasource === 'log' ? logDb : mainDb;
        await target.insertInto(table).values(row).execute();
      },
      close: async () => {
        await closeDbRuntime();
        await adminPool.query(`DROP DATABASE IF EXISTS \`${mainDbName}\``).catch(() => undefined);
        if (logDbName !== undefined) {
          await adminPool.query(`DROP DATABASE IF EXISTS \`${logDbName}\``).catch(() => undefined);
        }
        await adminPool.end().catch(() => undefined);
      }
    };
  } catch (error) {
    await closeDbRuntime().catch(() => undefined);
    await adminPool.query(`DROP DATABASE IF EXISTS \`${mainDbName}\``).catch(() => undefined);
    if (logDbName !== undefined) {
      await adminPool.query(`DROP DATABASE IF EXISTS \`${logDbName}\``).catch(() => undefined);
    }
    await adminPool.end().catch(() => undefined);
    throw error;
  }
};

/**
 * 轻量内存级 OceanBase Kysely 桩执行器（供无 Docker 本地 L0 单测验证编译 SQL、参数绑定与迁移流程）。
 */
export const createMockOceanBaseKysely = (
  handler: (query: CompiledQuery) => Promise<QueryResult<any>> | QueryResult<any>
): { db: Kysely<any>; queries: CompiledQuery[] } => {
  const queries: CompiledQuery[] = [];

  const connection: DatabaseConnection = {
    executeQuery: async <R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> => {
      queries.push(compiledQuery);
      return (await handler(compiledQuery)) as QueryResult<R>;
    },
    streamQuery: async function* () {
      return;
    }
  };

  const driver: Driver = {
    init: async () => undefined,
    acquireConnection: async () => connection,
    beginTransaction: async () => undefined,
    commitTransaction: async () => undefined,
    rollbackTransaction: async () => undefined,
    releaseConnection: async () => undefined,
    destroy: async () => undefined
  };

  const db = new Kysely<any>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => driver,
      createIntrospector: (innerDb) => new MysqlIntrospector(innerDb),
      createQueryCompiler: () => new MysqlQueryCompiler()
    }
  });

  return { db, queries };
};

export type ContractBackendContext = {
  dialect: DbDialect;
  insertRawRow: (params: {
    table: string;
    row: Record<string, unknown>;
    datasource?: DbDatasource;
  }) => Promise<void>;
  clearAll: () => Promise<void>;
};

export type ContractBackendEntry = {
  name: string;
  dialect: DbDialect;
  setup: () => Promise<ContractBackendContext>;
  teardown: () => Promise<void>;
};

/**
 * 构建 MongoDB + 可选真实 OceanBase/SeekDB 双引擎契约测试后端列表。
 *
 * 设置 `FASTGPT_TEST_REQUIRED_OCEANBASE=1` 时若缺少 `FASTGPT_TEST_OCEANBASE_URI` 会立即抛错，
 * 防止 CI 静默跳过真实 OceanBase 契约验证。
 */
export const createContractBackends = ({
  mongoCollections,
  oceanBaseTables,
  oceanBaseDdls,
  env = process.env
}: {
  mongoCollections: readonly MongoCollectionDefinition<any>[];
  oceanBaseTables: readonly string[];
  oceanBaseDdls: readonly string[];
  env?: Record<string, string | undefined>;
}): ContractBackendEntry[] => {
  const backends: ContractBackendEntry[] = [];

  let mongoHarness: MongoTestHarness | undefined;
  backends.push({
    name: 'mongo',
    dialect: 'mongo',
    setup: async () => {
      mongoHarness = await createMongoTestHarness({ collections: mongoCollections });
      const active = mongoHarness;
      return {
        dialect: 'mongo',
        insertRawRow: ({ table, row, datasource }) =>
          active.insertRawRow({ collection: table, doc: row, datasource }),
        clearAll: () => active.clearAll()
      };
    },
    teardown: async () => {
      await mongoHarness?.close();
      mongoHarness = undefined;
    }
  });

  const obUri = env.FASTGPT_TEST_OCEANBASE_URI?.trim() ?? '';
  const requireOb = env.FASTGPT_TEST_REQUIRED_OCEANBASE === '1';
  if (requireOb && obUri.length === 0) {
    throw new DbConfigurationError(
      'FASTGPT_TEST_REQUIRED_OCEANBASE=1 requires a non-empty FASTGPT_TEST_OCEANBASE_URI'
    );
  }

  if (obUri.length > 0) {
    let obHarness: OceanBaseTestHarness | undefined;
    backends.push({
      name: 'oceanbase',
      dialect: 'oceanbase',
      setup: async () => {
        obHarness = await createOceanBaseTestHarness({
          uri: obUri,
          tables: oceanBaseTables,
          ddls: oceanBaseDdls
        });
        const active = obHarness;
        return {
          dialect: 'oceanbase',
          insertRawRow: ({ table, row, datasource }) =>
            active.insertRawRow({ table, row, datasource }),
          clearAll: () => active.clearAll()
        };
      },
      teardown: async () => {
        await obHarness?.close();
        obHarness = undefined;
      }
    });
  }

  return backends;
};

// ============================================================================
// 共享测试态 MongoDB 索引就绪屏障（供根 test/setup.ts、Pro 与集成测试统一复用）
// ============================================================================

type SavedCollectionMethodDescriptor = {
  key: PropertyKey;
  hadOwn: boolean;
  descriptor?: PropertyDescriptor;
};

type TestMongoIndexReadinessState = {
  readyModels: WeakSet<Model<any>>;
  inFlight: WeakMap<Model<any>, Promise<void>>;
  collectionModels: Map<object, Set<Model<any>>>;
  wrappedCollections: Map<object, SavedCollectionMethodDescriptor[]>;
  originalModelFn: Mongoose['model'];
};

const testReadinessStates = new WeakMap<Mongoose, TestMongoIndexReadinessState>();

const TEST_MONGO_COLLECTION_ASYNC_BARRIER_METHODS = [
  'insertOne',
  'insertMany',
  'updateOne',
  'updateMany',
  'replaceOne',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'bulkWrite',
  'findOne',
  'countDocuments',
  'distinct',
  'deleteOne',
  'deleteMany'
] as const;

const TEST_MONGO_COLLECTION_CURSOR_BARRIER_METHODS = ['find', 'aggregate'] as const;

const TEST_MONGO_CURSOR_CONSUME_METHODS: readonly PropertyKey[] = [
  'toArray',
  'next',
  'hasNext',
  'tryNext',
  'forEach',
  'count',
  Symbol.asyncIterator
];

const dedupeMongoClients = (clients: readonly (Mongoose | undefined)[]): Mongoose[] =>
  Array.from(new Set(clients.filter((client): client is Mongoose => client !== undefined)));

const ensureModelIndexesReady = ({
  client,
  state,
  model
}: {
  client: Mongoose;
  state: TestMongoIndexReadinessState;
  model: Model<any>;
}): Promise<void> => {
  if (state.readyModels.has(model) || model.schema.get('autoIndex') === false) {
    return Promise.resolve();
  }
  if (client.connection.readyState !== 1) {
    return Promise.resolve();
  }

  let task = state.inFlight.get(model);
  if (task === undefined) {
    task = model
      .createIndexes()
      .then(() => {
        state.readyModels.add(model);
        state.inFlight.delete(model);
      })
      .catch((error) => {
        state.inFlight.delete(model);
        throw error;
      });
    state.inFlight.set(model, task);
  }
  return task;
};

const invokeMethodAfterReady = ({
  receiver,
  method,
  args,
  waitReady
}: {
  receiver: unknown;
  method: (...a: unknown[]) => unknown;
  args: unknown[];
  waitReady: () => Promise<void>;
}): unknown => {
  const lastArg = args[args.length - 1];
  if (typeof lastArg === 'function') {
    void waitReady().then(
      () => {
        method.apply(receiver, args);
      },
      (error) => {
        (lastArg as (err: unknown) => void)(error);
      }
    );
    return undefined;
  }
  return waitReady().then(() => method.apply(receiver, args));
};

const createReadyAsyncIterator = async function* ({
  receiver,
  method,
  args,
  waitReady
}: {
  receiver: unknown;
  method: (...a: unknown[]) => AsyncIterableIterator<unknown>;
  args: unknown[];
  waitReady: () => Promise<void>;
}) {
  await waitReady();
  for await (const doc of method.apply(receiver, args)) {
    yield doc;
  }
};

const wrapCursorForTestReadiness = ({
  cursor,
  waitReady
}: {
  cursor: unknown;
  waitReady: () => Promise<void>;
}): unknown => {
  if (cursor === null || typeof cursor !== 'object') {
    return cursor;
  }
  const target = cursor as Record<PropertyKey, unknown>;

  for (const consumeMethod of TEST_MONGO_CURSOR_CONSUME_METHODS) {
    const originalConsume = target[consumeMethod];
    if (typeof originalConsume !== 'function') {
      continue;
    }

    if (consumeMethod === Symbol.asyncIterator) {
      target[consumeMethod] = function (this: unknown, ...args: unknown[]) {
        return createReadyAsyncIterator({
          receiver: this,
          method: originalConsume as (...a: unknown[]) => AsyncIterableIterator<unknown>,
          args,
          waitReady
        });
      };
      continue;
    }

    target[consumeMethod] = function (this: unknown, ...args: unknown[]) {
      return invokeMethodAfterReady({
        receiver: this,
        method: originalConsume as (...a: unknown[]) => unknown,
        args,
        waitReady
      });
    };
  }

  return cursor;
};

const wrapModelCollectionForTestReadiness = ({
  client,
  state,
  model
}: {
  client: Mongoose;
  state: TestMongoIndexReadinessState;
  model: Model<any>;
}): void => {
  if (model.schema.get('autoIndex') === false) {
    return;
  }
  const collection = model.collection as unknown as Record<PropertyKey, unknown> | undefined;
  if (collection === undefined || collection === null || typeof collection !== 'object') {
    return;
  }

  let boundModels = state.collectionModels.get(collection);
  if (boundModels === undefined) {
    boundModels = new Set<Model<any>>();
    state.collectionModels.set(collection, boundModels);
  }
  boundModels.add(model);

  if (state.wrappedCollections.has(collection)) {
    return;
  }

  const savedDescriptors: SavedCollectionMethodDescriptor[] = [];
  const getPendingModels = (): Model<any>[] => {
    const models = state.collectionModels.get(collection);
    if (models === undefined) {
      return [];
    }
    return Array.from(models).filter(
      (boundModel) =>
        boundModel.schema.get('autoIndex') !== false && !state.readyModels.has(boundModel)
    );
  };

  const isFastPathReady = () =>
    testReadinessStates.get(client) !== state ||
    client.connection.readyState !== 1 ||
    getPendingModels().length === 0;

  const waitReady = async (): Promise<void> => {
    const pending = getPendingModels();
    if (pending.length === 0) {
      return;
    }
    await Promise.all(
      pending.map((pendingModel) => ensureModelIndexesReady({ client, state, model: pendingModel }))
    );
  };

  for (const methodName of TEST_MONGO_COLLECTION_ASYNC_BARRIER_METHODS) {
    const original = collection[methodName];
    if (typeof original !== 'function') {
      continue;
    }
    const hadOwn = Object.prototype.hasOwnProperty.call(collection, methodName);
    savedDescriptors.push({
      key: methodName,
      hadOwn,
      descriptor: hadOwn ? Object.getOwnPropertyDescriptor(collection, methodName) : undefined
    });
    collection[methodName] = function (this: unknown, ...args: unknown[]) {
      if (isFastPathReady()) {
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      }
      return invokeMethodAfterReady({
        receiver: this,
        method: original as (...a: unknown[]) => unknown,
        args,
        waitReady
      });
    };
  }

  for (const methodName of TEST_MONGO_COLLECTION_CURSOR_BARRIER_METHODS) {
    const original = collection[methodName];
    if (typeof original !== 'function') {
      continue;
    }
    const hadOwn = Object.prototype.hasOwnProperty.call(collection, methodName);
    savedDescriptors.push({
      key: methodName,
      hadOwn,
      descriptor: hadOwn ? Object.getOwnPropertyDescriptor(collection, methodName) : undefined
    });
    collection[methodName] = function (this: unknown, ...args: unknown[]) {
      if (isFastPathReady()) {
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      }
      if (typeof args[args.length - 1] === 'function') {
        return invokeMethodAfterReady({
          receiver: this,
          method: original as (...a: unknown[]) => unknown,
          args,
          waitReady
        });
      }
      const result = (original as (...a: unknown[]) => unknown).apply(this, args);
      if (
        result !== null &&
        typeof result === 'object' &&
        typeof (result as PromiseLike<unknown>).then === 'function'
      ) {
        return waitReady().then(() => result);
      }
      return wrapCursorForTestReadiness({ cursor: result, waitReady });
    };
  }

  state.wrappedCollections.set(collection, savedDescriptors);
};

const wrapClientModelForTestReadiness = ({
  client,
  state
}: {
  client: Mongoose;
  state: TestMongoIndexReadinessState;
}): void => {
  const originalModelFn = state.originalModelFn;
  (client as { model: Mongoose['model'] }).model = function (this: Mongoose, ...args: unknown[]) {
    const model = (originalModelFn as (...innerArgs: unknown[]) => Model<any>).apply(this, args);
    if (model !== undefined && model.schema?.get('autoIndex') !== false) {
      wrapModelCollectionForTestReadiness({ client, state, model });
      if (client.connection.readyState === 1) {
        void ensureModelIndexesReady({ client, state, model }).catch(() => undefined);
      }
    }
    return model;
  } as unknown as Mongoose['model'];
};

/** 为测试客户端显式确保当前已注册模型的索引全部就绪。 */
export const ensureTestMongoIndexes = async (
  clients: readonly (Mongoose | undefined)[]
): Promise<void> => {
  const uniqueClients = dedupeMongoClients(clients);
  const tasks: Promise<void>[] = [];

  for (const client of uniqueClients) {
    if (client.connection.readyState !== 1) {
      continue;
    }
    const activeState = testReadinessStates.get(client);
    for (const model of Object.values(client.models)) {
      if (model.schema.get('autoIndex') === false) {
        continue;
      }
      if (activeState !== undefined) {
        wrapModelCollectionForTestReadiness({ client, state: activeState, model });
        tasks.push(ensureModelIndexesReady({ client, state: activeState, model }));
      } else {
        tasks.push(model.createIndexes().then(() => undefined));
      }
    }
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
};

/** 启用共享的测试态 Mongo 索引就绪契约（主仓、Pro 与集成测试装配层统一入口）。 */
export const enableTestMongoIndexReadiness = async (
  clients: readonly (Mongoose | undefined)[]
): Promise<void> => {
  const uniqueClients = dedupeMongoClients(clients);

  for (const client of uniqueClients) {
    client.set('autoIndex', false);
    if (testReadinessStates.has(client)) {
      continue;
    }
    const state: TestMongoIndexReadinessState = {
      readyModels: new WeakSet<Model<any>>(),
      inFlight: new WeakMap<Model<any>, Promise<void>>(),
      collectionModels: new Map(),
      wrappedCollections: new Map(),
      originalModelFn: client.model
    };
    testReadinessStates.set(client, state);
    wrapClientModelForTestReadiness({ client, state });

    for (const model of Object.values(client.models)) {
      wrapModelCollectionForTestReadiness({ client, state, model });
    }
  }

  await ensureTestMongoIndexes(uniqueClients);
};

/** 清理并恢复测试客户端上的 `client.model` 与 `model.collection` 拦截及状态缓存。 */
export const disableTestMongoIndexReadiness = (
  clients: readonly (Mongoose | undefined)[]
): void => {
  for (const client of dedupeMongoClients(clients)) {
    const state = testReadinessStates.get(client);
    if (state === undefined) {
      continue;
    }
    for (const [collection, savedDescriptors] of state.wrappedCollections) {
      const target = collection as Record<PropertyKey, unknown>;
      for (const entry of savedDescriptors) {
        if (entry.hadOwn && entry.descriptor !== undefined) {
          Object.defineProperty(target, entry.key, entry.descriptor);
        } else {
          Reflect.deleteProperty(target, entry.key);
        }
      }
    }
    state.wrappedCollections.clear();
    state.collectionModels.clear();
    (client as { model: Mongoose['model'] }).model = state.originalModelFn;
    testReadinessStates.delete(client);
  }
};
