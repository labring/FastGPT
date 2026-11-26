import { AsyncLocalStorage } from 'node:async_hooks';
import { Mongoose, type Model, type Schema } from 'mongoose';
import { DbConfigurationError } from '../errors';
import { getConfiguredDbRuntime } from '../runtime';
import type {
  DbDatasource,
  DbTransactionRunner,
  MongoCollectionDescriptor,
  MongoModelBinder
} from '../types';
import { createMongoTransactionRunner } from './base';
import type { MongoCollectionDefinition } from './collection';

type GlobalMongoHandles = typeof globalThis & {
  mongodb?: Mongoose;
  mongodbLog?: Mongoose;
};

/**
 * 获取进程共享的 MongoDB 主库 `Mongoose` 实例（HMR 安全，默认禁用 `autoIndex`）。
 *
 * 与存量 `packages/service/common/mongo` 共享同一物理实例，确保渐进迁移期间
 * 旧 Model 与新 `@fastgpt/dal` 仓储共用同一条 `ClientSession` 事务。
 */
export const getSharedMongoConnection = (): Mongoose => {
  const globalHandles = globalThis as GlobalMongoHandles;
  if (globalHandles.mongodb === undefined) {
    const conn = new Mongoose();
    conn.set('autoIndex', false);
    globalHandles.mongodb = conn;
  }
  return globalHandles.mongodb;
};

/**
 * 获取进程共享的独立 MongoDB 日志库 `Mongoose` 实例（仅 `logMode === 'separate'` 时使用）。
 */
export const getSharedMongoLogConnection = (): Mongoose => {
  const globalHandles = globalThis as GlobalMongoHandles;
  if (globalHandles.mongodbLog === undefined) {
    const conn = new Mongoose();
    conn.set('autoIndex', false);
    globalHandles.mongodbLog = conn;
  }
  return globalHandles.mongodbLog;
};

const instrumentedSchemas = new WeakSet<Schema>();
const modelTimingStorage = new AsyncLocalStorage<number>();

const TIMED_MONGO_OPERATIONS = [
  /^find/,
  'save',
  'create',
  /^update/,
  /^delete/,
  'aggregate',
  'count',
  'countDocuments',
  'estimatedDocumentCount',
  'distinct',
  'insertMany'
] as const;

const resolveMongoOpName = (context: any): string => {
  if (typeof context?.op === 'string') {
    return context.op;
  }
  if (context?._pipeline !== undefined) {
    return 'aggregate';
  }
  if (context?.constructor?.name === 'model') {
    return 'save/create';
  }
  return typeof context?.constructor?.name === 'string' ? context.constructor.name : 'unknown';
};

/**
 * 为 DAL Mongo Schema 安装统一操作计时与慢查询上报中间件（每 Schema 幂等安装一次）。
 *
 * 上报直通 `DbRuntime.recordOperation()`，与 SQL 层共享同一套慢查询告警与 Profiling 指标通道，
 * 避免依赖上层 `@fastgpt/service`。
 */
const installDalMongoObservabilityMiddleware = (
  schema: Schema,
  { table, datasource }: { table: string; datasource: DbDatasource }
): void => {
  if (instrumentedSchemas.has(schema)) {
    return;
  }

  const getStartTime = (context: any): number | undefined =>
    typeof context === 'function' ? modelTimingStorage.getStore() : context?._dalStartTime;

  const finishOperation = (context: any, success: boolean): void => {
    const startedAt = getStartTime(context);
    if (context !== null && typeof context === 'object') {
      delete context._dalStartTime;
    }
    if (startedAt === undefined) {
      return;
    }

    const runtime = getConfiguredDbRuntime();
    runtime?.recordOperation({
      datasource,
      table,
      operation: resolveMongoOpName(context),
      durationMs: Date.now() - startedAt,
      success
    });
  };

  const rawSchema = schema as any;
  for (const op of TIMED_MONGO_OPERATIONS) {
    rawSchema.pre(op, function (this: any, next: () => void) {
      if (typeof this === 'function') {
        modelTimingStorage.run(Date.now(), next);
        return;
      }
      this._dalStartTime = Date.now();
      next();
    });

    rawSchema.post(op, function (this: any, _result: any, next: () => void) {
      finishOperation(this, true);
      next();
    });

    rawSchema.post(op, function (this: any, error: any, _result: any, next: (err?: any) => void) {
      finishOperation(this, false);
      next(error);
    });
  }

  instrumentedSchemas.add(schema);
};

export type MongoRuntimeDeps = {
  transactionRunner: DbTransactionRunner;
  mongoModelBinder: MongoModelBinder;
  closeHandler?: () => Promise<void>;
};

/**
 * 构建基于 Mongoose 连接的 `@fastgpt/dal` 运行时依赖集合（事务执行器与幂等 Model 绑定器）。
 *
 * - `mongoModelBinder` 遵循 `DbRuntime.resolveEffectiveDatasource` 路由（`shared` 透明绑定主库连接，
 *   `separate` 绑定独立日志库连接），并在目标连接上幂等复用 `connection.models[name]`，彻底规避
 *   `OverwriteModelError` 与模块级 `let cachedModel` 生命周期泄漏。
 */
export const createMongoRuntimeDeps = ({
  getMainClient,
  getLogClient,
  closeHandler
}: {
  getMainClient: () => Mongoose;
  getLogClient?: () => Mongoose | undefined;
  closeHandler?: () => Promise<void>;
}): MongoRuntimeDeps => {
  const resolveClient = (effectiveDatasource: DbDatasource): Mongoose => {
    if (effectiveDatasource === 'log') {
      const logClient = getLogClient?.();
      if (logClient === undefined) {
        throw new DbConfigurationError('Separate log Mongo client is not configured');
      }
      return logClient;
    }
    return getMainClient();
  };

  const mongoModelBinder: MongoModelBinder = <TDoc, TModel = Model<TDoc>>({
    collection,
    datasource
  }: {
    collection: MongoCollectionDescriptor<TDoc>;
    datasource: DbDatasource;
  }): TModel => {
    const def = collection as MongoCollectionDefinition<TDoc>;
    const client = resolveClient(datasource);
    const modelKey = def.modelName ?? def.name;

    const existing = client.models[modelKey];
    if (existing !== undefined) {
      return existing as unknown as TModel;
    }

    installDalMongoObservabilityMiddleware(def.schema, {
      table: def.name,
      datasource: def.datasource
    });

    // 显式传入第三参数 collectionName，禁止 Mongoose 自动复数化或改写物理集合名
    const compiled = client.model(modelKey, def.schema, def.name);
    return compiled as unknown as TModel;
  };

  return {
    transactionRunner: createMongoTransactionRunner({
      getMainClient,
      getLogClient
    }),
    mongoModelBinder,
    ...(closeHandler !== undefined ? { closeHandler } : {})
  };
};

/**
 * 使用独立无 `socketTimeoutMS` 超时限制的临时连接执行大表 MongoDB DDL/建索引操作，
 * 避免与业务查询池共用 60s 超时导致大表建索引中途客户端断开。
 */
export const withMongoDdlConnection = async <T>({
  url,
  dbName,
  execute
}: {
  url: string;
  dbName?: string;
  execute: (ddlDb: Mongoose) => Promise<T>;
}): Promise<T> => {
  const ddlDb = new Mongoose();
  ddlDb.set('strictQuery', 'throw');
  ddlDb.set('autoIndex', false);

  await ddlDb.connect(url, {
    ...(dbName !== undefined && dbName.trim().length > 0 ? { dbName: dbName.trim() } : {}),
    bufferCommands: true,
    maxPoolSize: 2,
    minPoolSize: 0,
    connectTimeoutMS: 60_000,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 0,
    retryWrites: true,
    retryReads: true
  });

  try {
    return await execute(ddlDb);
  } finally {
    await ddlDb.disconnect().catch(() => undefined);
  }
};
