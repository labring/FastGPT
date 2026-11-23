import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { Kysely, MysqlDialect, PGliteDialect, PostgresDialect, sql, type MysqlPool } from 'kysely';
import { Mongoose, Types, type Model } from 'mongoose';
import { createPool } from 'mysql2';
import { Pool } from 'pg';
import { DbConfigurationError } from './errors';
import type { MongoCollectionDefinition } from './mongo/collection';
import { createMongoRuntimeDeps } from './mongo/runtime';
import { closeDbRuntime, configureDbRuntime, getDbRuntime } from './runtime';
import { compileSqlTableDDL, quoteSqlIdentifier, type SqlTableDefinition } from './sql/ddl';
import { createMysqlKyselyRuntimeDeps, type MysqlRuntimeDeps } from './sql/dialects/mysql';
import { createPostgresKyselyRuntimeDeps, type PostgresRuntimeDeps } from './sql/dialects/postgres';
import { createSqlQueryLogger } from './sql/observability';
import {
  getDbDialectFamily,
  type DbDatasource,
  type DbDialect,
  type DbDialectFamily,
  type DbLogMode,
  type SqlDialect
} from './types';

export type SqlTestHarness = {
  dialect: SqlDialect;
  db: Kysely<any>;
  logDb: Kysely<any>;
  /** 使用无 DDL 表锁的 `DELETE FROM` 清理本套件涉及表，避免 MySQL/OceanBase `TRUNCATE` 元数据锁争用。 */
  clearAll: () => Promise<void>;
  /** 兼容别名，内部委托给无锁 `clearAll()`。 */
  truncateAll: () => Promise<void>;
  /** 绕过业务仓储校验直接写入原始行，用于契约测试验证历史空值与脏数据兜底。 */
  insertRawRow: (params: {
    table: string;
    row: Record<string, unknown>;
    datasource?: DbDatasource;
  }) => Promise<void>;
  close: () => Promise<void>;
};

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

const EXTERNAL_SQL_URI_ENV_KEY: Record<SqlDialect, string> = {
  mysql: 'FASTGPT_TEST_MYSQL_URI',
  oceanbase: 'FASTGPT_TEST_OCEANBASE_URI',
  postgres: 'FASTGPT_TEST_PG_URI'
};

const getWorkerToken = (): string => {
  const raw = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '0';
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '');
  return cleaned.length > 0 ? cleaned : '0';
};

/** 生成按 Vitest Worker 隔离的随机数据库/Schema 名，防止并发测试互清或元数据锁冲突。 */
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

const withPostgresSearchPathInUrl = (rawUri: string, schemaName: string): string => {
  const parsed = new URL(rawUri);
  const existingOptions = parsed.searchParams.get('options');
  const searchPathOpt = `-c search_path=${schemaName}`;
  parsed.searchParams.set(
    'options',
    existingOptions !== null && existingOptions.trim().length > 0
      ? `${existingOptions.trim()} ${searchPathOpt}`
      : searchPathOpt
  );
  return parsed.toString();
};

const getTrimmedEnv = (
  env: Record<string, string | undefined>,
  key: string
): string | undefined => {
  const val = env[key];
  if (val === undefined) {
    return undefined;
  }
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * 解析 `FASTGPT_TEST_REQUIRED_SQL_DIALECTS`（逗号分隔的 `mysql` / `oceanbase` / `postgres`）。
 *
 * CI 开启该环境变量后，若对应真实 SQL 引擎 URI 缺失或后端未实际挂载，契约测试与防漂移守卫必须立即失败，
 * 严禁静默降级跳过。
 */
export const parseRequiredSqlDialects = (
  env: Record<string, string | undefined> = process.env
): SqlDialect[] => {
  const raw = getTrimmedEnv(env, 'FASTGPT_TEST_REQUIRED_SQL_DIALECTS');
  if (raw === undefined) {
    return [];
  }

  const result: SqlDialect[] = [];
  for (const token of raw.split(',')) {
    const normalized = token.trim().toLowerCase();
    if (normalized.length === 0) {
      continue;
    }
    if (normalized !== 'mysql' && normalized !== 'oceanbase' && normalized !== 'postgres') {
      throw new DbConfigurationError(
        `Invalid dialect "${token.trim()}" in FASTGPT_TEST_REQUIRED_SQL_DIALECTS (expected mysql, oceanbase, or postgres)`
      );
    }
    if (!result.includes(normalized)) {
      result.push(normalized);
    }
  }
  return result;
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
      // 仅对操作系统瞬态随机端口竞态重试，其余真实错误立即抛出
      if (!/already in use/i.test(msg) || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw lastError;
};

/**
 * 为 `@fastgpt/dal` 独立契约测试创建零业务依赖的 MongoDB 副本集沙盒，并注册 `DbRuntime`。
 *
 * 优先复用外部传入 `uri` 或 `FASTGPT_TEST_MONGODB_URI`（保持原始多节点副本集 URI 与 `authSource` 完整不改写，
 * 仅通过 `connect(uri, { dbName })` 按 Worker + 随机库名隔离，测试结束自动 dropDatabase）；
 * 未提供外部副本集时按需动态拉起进程内 `MongoMemoryReplSet`（纯单测不触发启动开销）。
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
  let mainConnected = false;
  let logConnected = false;
  let runtimeConfigured = false;

  try {
    let baseUri: string;
    if (hasExternalUri) {
      baseUri = externalUri.trim();
    } else {
      const started = await startMongoMemoryReplSetWithRetry();
      replSet = started;
      baseUri = started.getUri();
    }

    const mainDbName = buildWorkerIsolatedDatabaseName('fg_dal_main');
    const logDbName =
      logMode === 'separate' ? buildWorkerIsolatedDatabaseName('fg_dal_log') : undefined;

    // 严禁使用 new URL(baseUri) 改写 Mongo URI：多节点副本集（h1:27017,h2:27017）不是合法 WHATWG URL，
    // 且改写 pathname 会破坏默认 authSource；统一透传原串并用 Mongoose 原生 { dbName } 隔离库名。
    mainClient = new Mongoose();
    mainClient.set('strictQuery', 'throw');
    mainClient.set('autoIndex', false);
    await mainClient.connect(baseUri, { dbName: mainDbName });
    mainConnected = true;

    if (logDbName !== undefined) {
      logClient = new Mongoose();
      logClient.set('strictQuery', 'throw');
      logClient.set('autoIndex', false);
      await logClient.connect(baseUri, { dbName: logDbName });
      logConnected = true;
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
    runtimeConfigured = true;

    const activeCollections: readonly MongoCollectionDefinition<any>[] = [
      ...collections,
      ...logCollections
    ];

    // Mongo 副本集多文档事务要求目标集合在事务开启前已存在
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
    // 任意初始化步骤失败时按严格逆序回收已分配资源，防止泄漏外部测试库、连接或内存副本集进程
    if (runtimeConfigured) {
      await closeDbRuntime().catch(() => undefined);
    }
    if (logConnected && logClient !== undefined) {
      if (hasExternalUri) {
        await logClient.connection.dropDatabase().catch(() => undefined);
      }
      await logClient.disconnect().catch(() => undefined);
    }
    if (mainConnected && mainClient !== undefined) {
      if (hasExternalUri) {
        await mainClient.connection.dropDatabase().catch(() => undefined);
      }
      await mainClient.disconnect().catch(() => undefined);
    }
    if (replSet !== undefined) {
      await replSet.stop().catch(() => undefined);
    }
    throw error;
  }
};

const createKyselyOverPGlite = async (
  tables: readonly SqlTableDefinition[],
  datasource: DbDatasource
): Promise<{ pglite: PGlite; db: Kysely<any> }> => {
  const pglite = new PGlite();
  await pglite.waitReady;

  const db = new Kysely<any>({
    dialect: new PGliteDialect({ pglite }),
    log: createSqlQueryLogger(datasource)
  });

  try {
    for (const table of tables) {
      const statements = compileSqlTableDDL(table, 'postgres');
      for (const stmt of statements) {
        await sql.raw(stmt).execute(db);
      }
    }
    return { pglite, db };
  } catch (error) {
    await db.destroy().catch(() => undefined);
    throw error;
  }
};

/**
 * 为单元测试创建毫秒级进程内 PGlite + Kysely 沙盒，并注册 `@fastgpt/dal/db` Runtime。
 *
 * 通过统一的 `compileSqlTableDDL` 建表，并使用无表锁 `DELETE FROM` 清理用例数据。
 */
export const createPGliteSqlTestHarness = async ({
  tables,
  logTables,
  withLogDatabase = false,
  logMode
}: {
  tables: readonly SqlTableDefinition[];
  logTables?: readonly SqlTableDefinition[];
  withLogDatabase?: boolean;
  /** 日志数据源双态模式；未显式传入时 `withLogDatabase=true` 对应 `separate`，否则默认 `shared` 复用主库。 */
  logMode?: DbLogMode;
}): Promise<SqlTestHarness> => {
  await closeDbRuntime();

  const resolvedLogMode: DbLogMode = logMode ?? (withLogDatabase ? 'separate' : 'shared');
  const mainTables = resolvedLogMode === 'shared' ? [...tables, ...(logTables ?? [])] : tables;

  let main: { pglite: PGlite; db: Kysely<any> } | undefined;
  let log: { pglite: PGlite; db: Kysely<any> } | undefined;
  let runtimeConfigured = false;

  try {
    main = await createKyselyOverPGlite(mainTables, 'main');
    log =
      resolvedLogMode === 'separate'
        ? await createKyselyOverPGlite(logTables ?? [], 'log')
        : undefined;

    const mainDb = main.db;
    const logDb = log?.db;

    const resolveTargetDb = (datasource: DbDatasource): Kysely<any> => {
      if (datasource === 'log') {
        return logDb ?? mainDb;
      }
      return mainDb;
    };

    configureDbRuntime({
      dialect: 'postgres',
      mainWriteUrl: 'pglite://memory/main',
      ...(resolvedLogMode === 'separate' ? { logWriteUrl: 'pglite://memory/log' } : {}),
      sqlExecutorResolver: ({ datasource, nativeTx }) => {
        if (nativeTx !== undefined) {
          return nativeTx;
        }
        return resolveTargetDb(datasource);
      },
      transactionRunner: async ({ datasource, execute }) => {
        const targetDb = resolveTargetDb(datasource);
        return targetDb.transaction().execute(async (trx) => execute(trx));
      },
      healthChecker: async (datasource) => {
        const targetDb = resolveTargetDb(datasource);
        await sql`SELECT 1`.execute(targetDb);
      }
    });
    runtimeConfigured = true;

    const managedTables = [
      ...mainTables.map((t) => ({ name: t.name, target: mainDb })),
      ...(logDb !== undefined
        ? (logTables ?? []).map((t) => ({ name: t.name, target: logDb }))
        : [])
    ];

    const clearAll = async (): Promise<void> => {
      for (const item of managedTables) {
        await sql
          .raw(`DELETE FROM ${quoteSqlIdentifier(item.name, 'postgres')}`)
          .execute(item.target);
      }
    };

    return {
      dialect: 'postgres',
      db: mainDb,
      logDb: logDb ?? mainDb,
      clearAll,
      truncateAll: clearAll,
      insertRawRow: async ({ table, row, datasource = 'main' }) => {
        await resolveTargetDb(datasource).insertInto(table).values(row).execute();
      },
      close: async () => {
        await closeDbRuntime();
        await mainDb.destroy();
        if (logDb !== undefined) {
          await logDb.destroy();
        }
      }
    };
  } catch (error) {
    if (runtimeConfigured) {
      await closeDbRuntime().catch(() => undefined);
    }
    if (log !== undefined) {
      await log.db.destroy().catch(() => undefined);
    }
    if (main !== undefined) {
      await main.db.destroy().catch(() => undefined);
    }
    throw error;
  }
};

/**
 * 为真实 MySQL 8+ 或 OceanBase 4.3+ / SeekDB 创建按 Worker 隔离的独立库沙盒并注册 `DbRuntime`。
 *
 * 自动以 `utf8mb4_bin` 建库、执行 `compileSqlTableDDL`、用例间以无锁 `DELETE FROM` 清理，
 * 初始化中途失败或测试结束均按逆序自动回收连接池并 `DROP DATABASE IF EXISTS`。
 */
export const createMysqlSqlTestHarness = async ({
  dialect,
  uri,
  tables,
  logTables,
  logMode = 'shared'
}: {
  dialect: 'mysql' | 'oceanbase';
  uri: string;
  tables: readonly SqlTableDefinition[];
  logTables?: readonly SqlTableDefinition[];
  logMode?: DbLogMode;
}): Promise<SqlTestHarness> => {
  await closeDbRuntime();

  const mainDbName = buildWorkerIsolatedDatabaseName(`fg_${dialect}_main`);
  const logDbName =
    logMode === 'separate' ? buildWorkerIsolatedDatabaseName(`fg_${dialect}_log`) : undefined;

  const adminDb = new Kysely<any>({
    dialect: new MysqlDialect({
      pool: createPool({
        uri,
        connectionLimit: 2,
        timezone: 'Z',
        charset: 'utf8mb4'
      }) as unknown as MysqlPool
    })
  });

  let createdMainDb = false;
  let createdLogDb = false;
  let deps: MysqlRuntimeDeps | undefined;
  let runtimeConfigured = false;

  try {
    await sql
      .raw(
        `CREATE DATABASE IF NOT EXISTS ${quoteSqlIdentifier(mainDbName, dialect)} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;`
      )
      .execute(adminDb);
    createdMainDb = true;

    if (logDbName !== undefined) {
      await sql
        .raw(
          `CREATE DATABASE IF NOT EXISTS ${quoteSqlIdentifier(logDbName, dialect)} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;`
        )
        .execute(adminDb);
      createdLogDb = true;
    }

    const mainWriteUrl = withDatabaseNameInUrl(uri, mainDbName);
    const logWriteUrl = logDbName !== undefined ? withDatabaseNameInUrl(uri, logDbName) : undefined;
    deps = createMysqlKyselyRuntimeDeps({
      mainWriteUrl,
      logWriteUrl,
      maxConnections: 10
    });

    configureDbRuntime({
      dialect,
      mainWriteUrl,
      ...(logWriteUrl !== undefined ? { logWriteUrl } : {}),
      ...deps
    });
    runtimeConfigured = true;

    const mainDb = deps.sqlExecutorResolver({ datasource: 'main', target: 'write' });
    const logDb = deps.sqlExecutorResolver({ datasource: 'log', target: 'write' });

    const mainTables = logMode === 'shared' ? [...tables, ...(logTables ?? [])] : tables;
    for (const table of mainTables) {
      for (const stmt of compileSqlTableDDL(table, dialect)) {
        await sql.raw(stmt).execute(mainDb);
      }
    }
    if (logMode === 'separate') {
      for (const table of logTables ?? []) {
        for (const stmt of compileSqlTableDDL(table, dialect)) {
          await sql.raw(stmt).execute(logDb);
        }
      }
    }

    const managedTables = [
      ...mainTables.map((t) => ({ name: t.name, target: mainDb })),
      ...(logMode === 'separate'
        ? (logTables ?? []).map((t) => ({ name: t.name, target: logDb }))
        : [])
    ];

    const clearAll = async (): Promise<void> => {
      for (const item of managedTables) {
        await sql.raw(`DELETE FROM ${quoteSqlIdentifier(item.name, dialect)}`).execute(item.target);
      }
    };

    return {
      dialect,
      db: mainDb,
      logDb,
      clearAll,
      truncateAll: clearAll,
      insertRawRow: async ({ table, row, datasource = 'main' }) => {
        const target = datasource === 'log' ? logDb : mainDb;
        await target.insertInto(table).values(row).execute();
      },
      close: async () => {
        await closeDbRuntime();
        await sql
          .raw(`DROP DATABASE IF EXISTS ${quoteSqlIdentifier(mainDbName, dialect)};`)
          .execute(adminDb)
          .catch(() => undefined);
        if (logDbName !== undefined) {
          await sql
            .raw(`DROP DATABASE IF EXISTS ${quoteSqlIdentifier(logDbName, dialect)};`)
            .execute(adminDb)
            .catch(() => undefined);
        }
        await adminDb.destroy().catch(() => undefined);
      }
    };
  } catch (error) {
    // 严格逆序回收：先关闭业务连接池/Runtime，再删除已建隔离库，最后销毁 admin 连接池并重抛原异常
    if (runtimeConfigured) {
      await closeDbRuntime().catch(() => undefined);
    } else if (deps !== undefined) {
      await deps.closeHandler().catch(() => undefined);
    }
    if (createdLogDb && logDbName !== undefined) {
      await sql
        .raw(`DROP DATABASE IF EXISTS ${quoteSqlIdentifier(logDbName, dialect)};`)
        .execute(adminDb)
        .catch(() => undefined);
    }
    if (createdMainDb) {
      await sql
        .raw(`DROP DATABASE IF EXISTS ${quoteSqlIdentifier(mainDbName, dialect)};`)
        .execute(adminDb)
        .catch(() => undefined);
    }
    await adminDb.destroy().catch(() => undefined);
    throw error;
  }
};

/**
 * 为真实 PostgreSQL >= 14 创建按 Worker 隔离的 Schema 沙盒并注册 `DbRuntime`。
 *
 * 初始化中途失败或测试结束均按逆序自动回收连接池并 `DROP SCHEMA IF EXISTS ... CASCADE`。
 */
export const createPostgresSqlTestHarness = async ({
  uri,
  tables,
  logTables,
  logMode = 'shared'
}: {
  uri: string;
  tables: readonly SqlTableDefinition[];
  logTables?: readonly SqlTableDefinition[];
  logMode?: DbLogMode;
}): Promise<SqlTestHarness> => {
  await closeDbRuntime();

  const mainSchema = buildWorkerIsolatedDatabaseName('fg_pg_main');
  const logSchema =
    logMode === 'separate' ? buildWorkerIsolatedDatabaseName('fg_pg_log') : undefined;

  const adminDb = new Kysely<any>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: uri, max: 2 })
    })
  });

  let createdMainSchema = false;
  let createdLogSchema = false;
  let deps: PostgresRuntimeDeps | undefined;
  let runtimeConfigured = false;

  try {
    await sql
      .raw(`CREATE SCHEMA IF NOT EXISTS ${quoteSqlIdentifier(mainSchema, 'postgres')};`)
      .execute(adminDb);
    createdMainSchema = true;

    if (logSchema !== undefined) {
      await sql
        .raw(`CREATE SCHEMA IF NOT EXISTS ${quoteSqlIdentifier(logSchema, 'postgres')};`)
        .execute(adminDb);
      createdLogSchema = true;
    }

    const mainWriteUrl = withPostgresSearchPathInUrl(uri, mainSchema);
    const logWriteUrl =
      logSchema !== undefined ? withPostgresSearchPathInUrl(uri, logSchema) : undefined;
    deps = createPostgresKyselyRuntimeDeps({
      mainWriteUrl,
      logWriteUrl,
      maxConnections: 10
    });

    configureDbRuntime({
      dialect: 'postgres',
      mainWriteUrl,
      ...(logWriteUrl !== undefined ? { logWriteUrl } : {}),
      ...deps
    });
    runtimeConfigured = true;

    const mainDb = deps.sqlExecutorResolver({ datasource: 'main', target: 'write' });
    const logDb = deps.sqlExecutorResolver({ datasource: 'log', target: 'write' });

    const mainTables = logMode === 'shared' ? [...tables, ...(logTables ?? [])] : tables;
    for (const table of mainTables) {
      for (const stmt of compileSqlTableDDL(table, 'postgres')) {
        await sql.raw(stmt).execute(mainDb);
      }
    }
    if (logMode === 'separate') {
      for (const table of logTables ?? []) {
        for (const stmt of compileSqlTableDDL(table, 'postgres')) {
          await sql.raw(stmt).execute(logDb);
        }
      }
    }

    const managedTables = [
      ...mainTables.map((t) => ({ name: t.name, target: mainDb })),
      ...(logMode === 'separate'
        ? (logTables ?? []).map((t) => ({ name: t.name, target: logDb }))
        : [])
    ];

    const clearAll = async (): Promise<void> => {
      for (const item of managedTables) {
        await sql
          .raw(`DELETE FROM ${quoteSqlIdentifier(item.name, 'postgres')}`)
          .execute(item.target);
      }
    };

    return {
      dialect: 'postgres',
      db: mainDb,
      logDb,
      clearAll,
      truncateAll: clearAll,
      insertRawRow: async ({ table, row, datasource = 'main' }) => {
        const target = datasource === 'log' ? logDb : mainDb;
        await target.insertInto(table).values(row).execute();
      },
      close: async () => {
        await closeDbRuntime();
        await sql
          .raw(`DROP SCHEMA IF EXISTS ${quoteSqlIdentifier(mainSchema, 'postgres')} CASCADE;`)
          .execute(adminDb)
          .catch(() => undefined);
        if (logSchema !== undefined) {
          await sql
            .raw(`DROP SCHEMA IF EXISTS ${quoteSqlIdentifier(logSchema, 'postgres')} CASCADE;`)
            .execute(adminDb)
            .catch(() => undefined);
        }
        await adminDb.destroy().catch(() => undefined);
      }
    };
  } catch (error) {
    // 严格逆序回收：先关闭业务连接池/Runtime，再删除已建 Schema，最后销毁 admin 连接池并重抛原异常
    if (runtimeConfigured) {
      await closeDbRuntime().catch(() => undefined);
    } else if (deps !== undefined) {
      await deps.closeHandler().catch(() => undefined);
    }
    if (createdLogSchema && logSchema !== undefined) {
      await sql
        .raw(`DROP SCHEMA IF EXISTS ${quoteSqlIdentifier(logSchema, 'postgres')} CASCADE;`)
        .execute(adminDb)
        .catch(() => undefined);
    }
    if (createdMainSchema) {
      await sql
        .raw(`DROP SCHEMA IF EXISTS ${quoteSqlIdentifier(mainSchema, 'postgres')} CASCADE;`)
        .execute(adminDb)
        .catch(() => undefined);
    }
    await adminDb.destroy().catch(() => undefined);
    throw error;
  }
};

export type RawRowInsertPayload = {
  mongo: { collection: string; doc: Record<string, unknown> };
  sql: { table: string; row: Record<string, unknown> };
  datasource?: DbDatasource;
};

export type ContractBackendContext = {
  getDialect: () => DbDialect;
  getFamily: () => DbDialectFamily;
  /** PGlite 为单连接内存引擎，并发锁竞争套件可据此仅在真实多连接引擎（Mongo / MySQL / OB / PG）执行。 */
  supportsMultiConnectionConcurrency: () => boolean;
  insertRawRow: (payload: RawRowInsertPayload) => Promise<void>;
};

export type ContractBackendEntry = {
  label: string;
  dialect: DbDialect;
  supportsMultiConnectionConcurrency?: boolean;
  setup: () => Promise<void>;
  cleanupEach?: () => Promise<void>;
  teardown: () => Promise<void>;
  insertRawRow?: (payload: RawRowInsertPayload) => Promise<void>;
};

/**
 * 按当前环境变量动态装配多数据库契约测试矩阵（MongoDB + PGlite + 可选 MySQL 8 / OceanBase / PostgreSQL）。
 *
 * - 本地零配置默认挂载 MongoDB（副本集）与 SQL（PGlite）；
 * - CI 或本地配置 `FASTGPT_TEST_MYSQL_URI` / `FASTGPT_TEST_OCEANBASE_URI` / `FASTGPT_TEST_PG_URI` 后，
 *   同一份契约测试自动重放到真实关系型引擎；
 * - 若配置了 `FASTGPT_TEST_REQUIRED_SQL_DIALECTS`，强制校验对应真实引擎 URI 非空并已挂载，缺省时立即抛错；
 * - 严禁产出空后端列表，若无任何可用后端直接抛出 `DbConfigurationError`。
 */
export const createContractBackends = ({
  collections,
  logCollections = [],
  tables,
  logTables = [],
  logMode = 'shared',
  includeMongo = true,
  includePGlite = true,
  env = process.env
}: {
  collections: readonly MongoCollectionDefinition<any>[];
  logCollections?: readonly MongoCollectionDefinition<any>[];
  tables: readonly SqlTableDefinition[];
  logTables?: readonly SqlTableDefinition[];
  logMode?: DbLogMode;
  includeMongo?: boolean;
  includePGlite?: boolean;
  env?: Record<string, string | undefined>;
}): ContractBackendEntry[] => {
  const requiredSqlDialects = parseRequiredSqlDialects(env);
  for (const requiredDialect of requiredSqlDialects) {
    const uriEnvKey = EXTERNAL_SQL_URI_ENV_KEY[requiredDialect];
    if (getTrimmedEnv(env, uriEnvKey) === undefined) {
      throw new DbConfigurationError(
        `FASTGPT_TEST_REQUIRED_SQL_DIALECTS requires "${requiredDialect}", but ${uriEnvKey} is missing or empty`
      );
    }
  }

  const backends: ContractBackendEntry[] = [];

  if (includeMongo) {
    let mongoHarness: MongoTestHarness | undefined;
    backends.push({
      label: 'MongoDB',
      dialect: 'mongo',
      supportsMultiConnectionConcurrency: true,
      setup: async () => {
        mongoHarness = await createMongoTestHarness({
          collections,
          logCollections,
          logMode,
          uri: getTrimmedEnv(env, 'FASTGPT_TEST_MONGODB_URI')
        });
      },
      cleanupEach: async () => {
        await mongoHarness?.clearAll();
      },
      teardown: async () => {
        await mongoHarness?.close();
        mongoHarness = undefined;
      },
      insertRawRow: async ({ mongo, datasource }) => {
        if (mongoHarness === undefined) {
          throw new DbConfigurationError('Mongo contract backend is not initialized');
        }
        await mongoHarness.insertRawRow({
          collection: mongo.collection,
          doc: mongo.doc,
          datasource
        });
      }
    });
  }

  if (includePGlite) {
    let pgliteHarness: SqlTestHarness | undefined;
    backends.push({
      label: 'SQL (PGlite)',
      dialect: 'postgres',
      supportsMultiConnectionConcurrency: false,
      setup: async () => {
        pgliteHarness = await createPGliteSqlTestHarness({
          tables,
          logTables,
          logMode
        });
      },
      cleanupEach: async () => {
        await pgliteHarness?.clearAll();
      },
      teardown: async () => {
        await pgliteHarness?.close();
        pgliteHarness = undefined;
      },
      insertRawRow: async ({ sql: sqlPayload, datasource }) => {
        if (pgliteHarness === undefined) {
          throw new DbConfigurationError('PGlite contract backend is not initialized');
        }
        await pgliteHarness.insertRawRow({
          table: sqlPayload.table,
          row: sqlPayload.row,
          datasource
        });
      }
    });
  }

  const mysqlUri = getTrimmedEnv(env, 'FASTGPT_TEST_MYSQL_URI');
  if (mysqlUri !== undefined) {
    let mysqlHarness: SqlTestHarness | undefined;
    backends.push({
      label: 'SQL (MySQL 8)',
      dialect: 'mysql',
      supportsMultiConnectionConcurrency: true,
      setup: async () => {
        mysqlHarness = await createMysqlSqlTestHarness({
          dialect: 'mysql',
          uri: mysqlUri,
          tables,
          logTables,
          logMode
        });
      },
      cleanupEach: async () => {
        await mysqlHarness?.clearAll();
      },
      teardown: async () => {
        await mysqlHarness?.close();
        mysqlHarness = undefined;
      },
      insertRawRow: async ({ sql: sqlPayload, datasource }) => {
        if (mysqlHarness === undefined) {
          throw new DbConfigurationError('MySQL contract backend is not initialized');
        }
        await mysqlHarness.insertRawRow({
          table: sqlPayload.table,
          row: sqlPayload.row,
          datasource
        });
      }
    });
  }

  const oceanbaseUri = getTrimmedEnv(env, 'FASTGPT_TEST_OCEANBASE_URI');
  if (oceanbaseUri !== undefined) {
    let obHarness: SqlTestHarness | undefined;
    backends.push({
      label: 'SQL (OceanBase)',
      dialect: 'oceanbase',
      supportsMultiConnectionConcurrency: true,
      setup: async () => {
        obHarness = await createMysqlSqlTestHarness({
          dialect: 'oceanbase',
          uri: oceanbaseUri,
          tables,
          logTables,
          logMode
        });
      },
      cleanupEach: async () => {
        await obHarness?.clearAll();
      },
      teardown: async () => {
        await obHarness?.close();
        obHarness = undefined;
      },
      insertRawRow: async ({ sql: sqlPayload, datasource }) => {
        if (obHarness === undefined) {
          throw new DbConfigurationError('OceanBase contract backend is not initialized');
        }
        await obHarness.insertRawRow({
          table: sqlPayload.table,
          row: sqlPayload.row,
          datasource
        });
      }
    });
  }

  const pgUri = getTrimmedEnv(env, 'FASTGPT_TEST_PG_URI');
  if (pgUri !== undefined) {
    let pgHarness: SqlTestHarness | undefined;
    backends.push({
      label: 'SQL (PostgreSQL)',
      dialect: 'postgres',
      supportsMultiConnectionConcurrency: true,
      setup: async () => {
        pgHarness = await createPostgresSqlTestHarness({
          uri: pgUri,
          tables,
          logTables,
          logMode
        });
      },
      cleanupEach: async () => {
        await pgHarness?.clearAll();
      },
      teardown: async () => {
        await pgHarness?.close();
        pgHarness = undefined;
      },
      insertRawRow: async ({ sql: sqlPayload, datasource }) => {
        if (pgHarness === undefined) {
          throw new DbConfigurationError('PostgreSQL contract backend is not initialized');
        }
        await pgHarness.insertRawRow({
          table: sqlPayload.table,
          row: sqlPayload.row,
          datasource
        });
      }
    });
  }

  if (backends.length === 0) {
    throw new DbConfigurationError(
      'createContractBackends produced zero backends; enable Mongo/PGlite or provide external SQL URIs'
    );
  }

  return backends;
};

/**
 * 声明多数据库共享契约测试矩阵（向测试回调提供统一 `ContractBackendContext`，含 `insertRawRow` 与并发能力标记）。
 *
 * 硬守卫：同步拒绝空 `backends`；默认（`requireBothFamilies = true`）同时要求覆盖 `mongo` 与 `sql` 双族，
 * 防止错误配置或过滤条件把共享契约测试退化为空跑或单边绿灯。
 */
export const registerMultiDialectContractSuite = ({
  describeFn,
  beforeAllFn,
  beforeEachFn,
  afterAllFn,
  backends,
  requireBothFamilies = true,
  registerTests
}: {
  describeFn: (name: string, fn: () => void) => void;
  beforeAllFn: (fn: () => Promise<void>) => void;
  beforeEachFn?: (fn: () => Promise<void>) => void;
  afterAllFn: (fn: () => Promise<void>) => void;
  backends: readonly ContractBackendEntry[];
  requireBothFamilies?: boolean;
  registerTests: (ctx: ContractBackendContext) => void;
}): void => {
  if (backends.length === 0) {
    throw new DbConfigurationError(
      'registerMultiDialectContractSuite requires at least one contract backend'
    );
  }

  if (requireBothFamilies) {
    const families = new Set(backends.map((backend) => getDbDialectFamily(backend.dialect)));
    if (!families.has('mongo') || !families.has('sql')) {
      throw new DbConfigurationError(
        `registerMultiDialectContractSuite requires both "mongo" and "sql" dialect families (received: ${Array.from(families).join(', ')})`
      );
    }
  }

  for (const backend of backends) {
    describeFn(`[${backend.label}]`, () => {
      beforeAllFn(backend.setup);
      if (beforeEachFn !== undefined && backend.cleanupEach !== undefined) {
        beforeEachFn(backend.cleanupEach);
      }
      afterAllFn(backend.teardown);
      registerTests({
        getDialect: () => backend.dialect,
        getFamily: () => getDbDialectFamily(backend.dialect),
        supportsMultiConnectionConcurrency: () =>
          backend.supportsMultiConnectionConcurrency === true,
        insertRawRow: async (payload) => {
          if (backend.insertRawRow === undefined) {
            throw new DbConfigurationError(
              `Backend "${backend.label}" does not implement insertRawRow`
            );
          }
          await backend.insertRawRow(payload);
        }
      });
    });
  }
};

export type DualRepoContractSuiteRunner = (params: {
  suiteName: string;
  backends: ReadonlyArray<{
    dialect: DbDialect;
    setup: () => Promise<void>;
    cleanupEach?: () => Promise<void>;
    teardown: () => Promise<void>;
  }>;
  registerTests: (getDialect: () => DbDialect) => void;
}) => void;

/**
 * 声明双/多数据库（Mongo + SQL）共享契约测试矩阵（兼容旧 `(getDialect) => void` 签名）。
 */
export const registerDualDialectContractSuite = ({
  describeFn,
  beforeAllFn,
  beforeEachFn,
  afterAllFn,
  backends,
  requireBothFamilies = true,
  registerTests
}: {
  describeFn: (name: string, fn: () => void) => void;
  beforeAllFn: (fn: () => Promise<void>) => void;
  beforeEachFn?: (fn: () => Promise<void>) => void;
  afterAllFn: (fn: () => Promise<void>) => void;
  backends: readonly ContractBackendEntry[];
  requireBothFamilies?: boolean;
  registerTests: (getDialect: () => DbDialect) => void;
}): void => {
  registerMultiDialectContractSuite({
    describeFn,
    beforeAllFn,
    beforeEachFn,
    afterAllFn,
    backends,
    requireBothFamilies,
    registerTests: (ctx) => registerTests(ctx.getDialect)
  });
};

export type LogTopologyVerifyCallbacks = {
  /** 通过目标日志仓储写入一条记录并返回主键 ID（shared/separate 各调用一次）。 */
  writeLogRecord: (ctx: { dialect: DbDialect; logMode: DbLogMode }) => Promise<{ id: string }>;
  /** 通过目标日志仓储按 ID 读回刚写入的记录（证明主写与读路由一致）。 */
  readLogRecord: (ctx: {
    dialect: DbDialect;
    logMode: DbLogMode;
    id: string;
  }) => Promise<unknown | null | undefined>;
  mongoCollectionName: string;
  sqlTableName: string;
  idField?: string;
};

export type RegisterLogTopologyContractSuiteParams = LogTopologyVerifyCallbacks & {
  describeFn: (name: string, fn: () => void) => unknown;
  itFn: (name: string, fn: () => Promise<void>, timeout?: number) => unknown;
  collections?: readonly MongoCollectionDefinition<any>[];
  logCollections: readonly MongoCollectionDefinition<any>[];
  tables?: readonly SqlTableDefinition[];
  logTables: readonly SqlTableDefinition[];
  includeMongo?: boolean;
  includePGlite?: boolean;
  /** 默认同时强制验证 MongoDB 与 SQL（PGlite）两族；禁止静默跳过任一数据库族。 */
  requireBothFamilies?: boolean;
  timeoutMs?: number;
};

const assertLogTopologyInvariant = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new DbConfigurationError(message);
  }
};

const buildMongoIdFilter = (id: string, idField: string): Record<string, unknown> => {
  if (idField === '_id' && /^[a-f0-9]{24}$/i.test(id)) {
    return {
      $or: [{ _id: new Types.ObjectId(id) }, { _id: id }, { _id: id.toLowerCase() }]
    };
  }
  return { [idField]: id };
};

/**
 * 在真实 MongoDB 沙盒上实际执行并验证日志域的 `'shared'` 与 `'separate'` 双态物理路由契约：
 * - `shared`：写入与读回均成功，且记录落入主物理库；
 * - `separate`：主/日志物理库均预先建好集合，若仓储误写主库也能落库并被立即捕获，
 *   强制断言记录只存在于独立日志物理库且主物理库计数严格为 0。
 */
export const verifyMongoLogTopologyIsolation = async ({
  logMode,
  collections = [],
  logCollections,
  writeLogRecord,
  readLogRecord,
  mongoCollectionName,
  idField = '_id',
  uri
}: {
  logMode: DbLogMode;
  collections?: readonly MongoCollectionDefinition<any>[];
  logCollections: readonly MongoCollectionDefinition<any>[];
  writeLogRecord: LogTopologyVerifyCallbacks['writeLogRecord'];
  readLogRecord: LogTopologyVerifyCallbacks['readLogRecord'];
  mongoCollectionName: string;
  idField?: string;
  uri?: string;
}): Promise<void> => {
  if (logCollections.length === 0) {
    throw new DbConfigurationError('verifyMongoLogTopologyIsolation requires logCollections');
  }

  // separate 模式下在主库也建出同名日志集合，防止“未建集合掩盖误写主库”或误路由写穿时报错不清晰
  const harness = await createMongoTestHarness({
    collections: logMode === 'separate' ? [...collections, ...logCollections] : collections,
    logCollections,
    logMode,
    uri
  });

  try {
    assertLogTopologyInvariant(
      getDbRuntime().logMode === logMode,
      `Expected DbRuntime.logMode="${logMode}", received "${getDbRuntime().logMode}"`
    );

    const written = await writeLogRecord({ dialect: 'mongo', logMode });
    assertLogTopologyInvariant(
      typeof written?.id === 'string' && written.id.trim().length > 0,
      `writeLogRecord in mongo/${logMode} must return a non-empty string id`
    );

    const readBack = await readLogRecord({ dialect: 'mongo', logMode, id: written.id });
    assertLogTopologyInvariant(
      readBack !== null && readBack !== undefined,
      `readLogRecord returned empty for mongo/${logMode} record "${written.id}"`
    );

    const mainDb = harness.client.connection.db;
    assertLogTopologyInvariant(mainDb !== undefined, 'Mongo main test database is not connected');
    const idFilter = buildMongoIdFilter(written.id, idField);
    const mainCount = await mainDb!.collection(mongoCollectionName).countDocuments(idFilter);

    if (logMode === 'shared') {
      assertLogTopologyInvariant(
        mainCount === 1,
        `Shared Mongo log topology expected 1 record in main collection "${mongoCollectionName}" for id="${written.id}", found ${mainCount}`
      );
      return;
    }

    assertLogTopologyInvariant(
      harness.logClient !== undefined && harness.logClient !== harness.client,
      'Separate Mongo log topology requires a distinct logClient'
    );
    const logDb = harness.logClient!.connection.db;
    assertLogTopologyInvariant(logDb !== undefined, 'Mongo log test database is not connected');
    const logCount = await logDb!.collection(mongoCollectionName).countDocuments(idFilter);

    // 先校验主物理库计数为 0，确保误写主库时直接暴露物理隔离违规，而非被 logCount === 0 掩盖
    assertLogTopologyInvariant(
      mainCount === 0,
      `Separate Mongo log topology isolation violated: record "${written.id}" was written to main physical DB instead of log physical DB`
    );
    assertLogTopologyInvariant(
      logCount === 1,
      `Separate Mongo log topology expected 1 record in log collection "${mongoCollectionName}" for id="${written.id}", found ${logCount}`
    );
  } finally {
    await harness.close();
  }
};

/**
 * 在真实 SQL（PGlite）沙盒上实际执行并验证日志域的 `'shared'` 与 `'separate'` 双态物理路由契约：
 * - `shared`：主库与日志库为同一物理库，写入后主库计数严格为 1 且可经仓储读回；
 * - `separate`：主/日志库物理隔离且主库也存在同名表，断言写入记录只存在于 `harness.logDb`、
 *   且 `harness.db` 主物理库计数严格为 0，从而彻底捕获未覆写 `datasource = 'log'` 的误写缺陷。
 */
export const verifySqlLogTopologyIsolation = async ({
  logMode,
  tables = [],
  logTables,
  writeLogRecord,
  readLogRecord,
  sqlTableName,
  idField = '_id'
}: {
  logMode: DbLogMode;
  tables?: readonly SqlTableDefinition[];
  logTables: readonly SqlTableDefinition[];
  writeLogRecord: LogTopologyVerifyCallbacks['writeLogRecord'];
  readLogRecord: LogTopologyVerifyCallbacks['readLogRecord'];
  sqlTableName: string;
  idField?: string;
}): Promise<void> => {
  if (logTables.length === 0) {
    throw new DbConfigurationError('verifySqlLogTopologyIsolation requires logTables');
  }

  // separate 模式下主库同样预建日志表：若 SqlRepository 漏设 `datasource = 'log'` 误写主库，下方的 mainCount === 0 断言必定抓出
  const harness = await createPGliteSqlTestHarness({
    tables: logMode === 'separate' ? [...tables, ...logTables] : tables,
    logTables,
    logMode
  });

  try {
    assertLogTopologyInvariant(
      getDbRuntime().logMode === logMode,
      `Expected DbRuntime.logMode="${logMode}", received "${getDbRuntime().logMode}"`
    );

    const written = await writeLogRecord({ dialect: 'postgres', logMode });
    assertLogTopologyInvariant(
      typeof written?.id === 'string' && written.id.trim().length > 0,
      `writeLogRecord in sql/${logMode} must return a non-empty string id`
    );

    const readBack = await readLogRecord({ dialect: 'postgres', logMode, id: written.id });
    assertLogTopologyInvariant(
      readBack !== null && readBack !== undefined,
      `readLogRecord returned empty for sql/${logMode} record "${written.id}"`
    );

    const mainRows = await harness.db
      .selectFrom(sqlTableName)
      .select(idField)
      .where(idField, '=', written.id)
      .execute();

    if (logMode === 'shared') {
      assertLogTopologyInvariant(
        harness.logDb === harness.db,
        'Shared SQL log topology expected logDb === db'
      );
      assertLogTopologyInvariant(
        mainRows.length === 1,
        `Shared SQL log topology expected 1 row in main table "${sqlTableName}" for id="${written.id}", found ${mainRows.length}`
      );
      return;
    }

    assertLogTopologyInvariant(
      harness.logDb !== harness.db,
      'Separate SQL log topology requires a physically distinct logDb'
    );
    const logRows = await harness.logDb
      .selectFrom(sqlTableName)
      .select(idField)
      .where(idField, '=', written.id)
      .execute();

    // 先校验主物理库行数为 0，确保误写主库时直接暴露物理隔离违规
    assertLogTopologyInvariant(
      mainRows.length === 0,
      `Separate SQL log topology isolation violated: record "${written.id}" in "${sqlTableName}" was written to main physical DB instead of log physical DB`
    );
    assertLogTopologyInvariant(
      logRows.length === 1,
      `Separate SQL log topology expected 1 row in log table "${sqlTableName}" for id="${written.id}", found ${logRows.length}`
    );
  } finally {
    await harness.close();
  }
};

type VitestTaskLike = {
  mode?: unknown;
  skip?: unknown;
};

type VitestCollectorLike = {
  type?: unknown;
  mode?: unknown;
  skip?: unknown;
  tasks?: VitestTaskLike[];
};

const isSkippedOrTodoMode = (entry: { mode?: unknown; skip?: unknown } | undefined): boolean =>
  entry?.mode === 'skip' || entry?.mode === 'todo' || entry?.skip === true;

const registerRunnableTopologySuite = ({
  describeFn,
  itFn,
  suiteTitle,
  expectedCases,
  register
}: {
  describeFn: (name: string, fn: () => void) => unknown;
  itFn: (name: string, fn: () => Promise<void>, timeout?: number) => unknown;
  suiteTitle: string;
  expectedCases: number;
  register: () => void;
}): void => {
  if (typeof describeFn !== 'function' || typeof itFn !== 'function') {
    throw new DbConfigurationError(
      'registerLogTopologyContractSuite requires runnable describeFn and itFn functions'
    );
  }

  let factoryExecuted = false;
  let collectorRef: VitestCollectorLike | undefined;

  const returned = describeFn(suiteTitle, () => {
    factoryExecuted = true;
    const tasksBefore = Array.isArray(collectorRef?.tasks) ? collectorRef.tasks.length : undefined;

    register();

    // Vitest 在 collect() 阶段执行 suite 回调：核对 itFn 真实追加了全部可执行用例且无 skip/todo。
    if (Array.isArray(collectorRef?.tasks)) {
      const addedTasks = collectorRef.tasks.slice(tasksBefore ?? 0);
      if (addedTasks.length < expectedCases) {
        throw new DbConfigurationError(
          `registerLogTopologyContractSuite expected ${expectedCases} runnable test cases in "${suiteTitle}", but itFn registered ${addedTasks.length}`
        );
      }
      const badTask = addedTasks.find((task) => isSkippedOrTodoMode(task));
      if (badTask !== undefined) {
        throw new DbConfigurationError(
          `registerLogTopologyContractSuite refuses skipped/todo itFn in "${suiteTitle}" (mode="${String(badTask.mode ?? 'skip')}")`
        );
      }
    }
  });

  if (returned !== null && typeof returned === 'object') {
    collectorRef = returned as VitestCollectorLike;
  }

  if (isSkippedOrTodoMode(collectorRef)) {
    throw new DbConfigurationError(
      `registerLogTopologyContractSuite refuses skipped/todo describeFn for "${suiteTitle}" (mode="${String(collectorRef?.mode ?? 'skip')}")`
    );
  }
  if (collectorRef?.type !== 'collector' && !factoryExecuted) {
    throw new DbConfigurationError(
      `registerLogTopologyContractSuite requires a runnable describeFn that executes suite registration for "${suiteTitle}"`
    );
  }
};

/**
 * 声明可复用的日志域双态（`shared` / `separate`）物理隔离标准契约套件。
 *
 * 强制验证写入/读回与物理落库位置，杜绝测试中仅断言 `expect(harness.logDb).toBeDefined()`
 * 或传入跳过式 `describe.skip` / `it.skip` 导致日志仓储误写主库却仍全绿的假阳性漏洞。
 */
export const registerLogTopologyContractSuite = ({
  describeFn,
  itFn,
  collections = [],
  logCollections,
  tables = [],
  logTables,
  writeLogRecord,
  readLogRecord,
  mongoCollectionName,
  sqlTableName,
  idField = '_id',
  includeMongo = true,
  includePGlite = true,
  requireBothFamilies = true,
  timeoutMs = 30_000
}: RegisterLogTopologyContractSuiteParams): void => {
  if (requireBothFamilies && (!includeMongo || !includePGlite)) {
    throw new DbConfigurationError(
      'registerLogTopologyContractSuite requires both Mongo and PGlite log topology verification'
    );
  }
  if (!includeMongo && !includePGlite) {
    throw new DbConfigurationError(
      'registerLogTopologyContractSuite requires at least one enabled dialect family'
    );
  }

  if (includeMongo) {
    registerRunnableTopologySuite({
      describeFn,
      itFn,
      suiteTitle: '[Log Topology: MongoDB (shared + separate)]',
      expectedCases: 2,
      register: () => {
        itFn(
          'routes log reads/writes through main physical DB in shared mode',
          async () => {
            await verifyMongoLogTopologyIsolation({
              logMode: 'shared',
              collections,
              logCollections,
              writeLogRecord,
              readLogRecord,
              mongoCollectionName,
              idField
            });
          },
          timeoutMs
        );
        itFn(
          'isolates log reads/writes into separate log physical DB without touching main DB',
          async () => {
            await verifyMongoLogTopologyIsolation({
              logMode: 'separate',
              collections,
              logCollections,
              writeLogRecord,
              readLogRecord,
              mongoCollectionName,
              idField
            });
          },
          timeoutMs
        );
      }
    });
  }

  if (includePGlite) {
    registerRunnableTopologySuite({
      describeFn,
      itFn,
      suiteTitle: '[Log Topology: SQL PGlite (shared + separate)]',
      expectedCases: 2,
      register: () => {
        itFn(
          'routes log reads/writes through main physical DB in shared mode',
          async () => {
            await verifySqlLogTopologyIsolation({
              logMode: 'shared',
              tables,
              logTables,
              writeLogRecord,
              readLogRecord,
              sqlTableName,
              idField
            });
          },
          timeoutMs
        );
        itFn(
          'isolates log reads/writes into separate log physical DB without touching main DB',
          async () => {
            await verifySqlLogTopologyIsolation({
              logMode: 'separate',
              tables,
              logTables,
              writeLogRecord,
              readLogRecord,
              sqlTableName,
              idField
            });
          },
          timeoutMs
        );
      }
    });
  }
};

type SavedCollectionMethodDescriptor = {
  key: PropertyKey;
  hadOwn: boolean;
  descriptor?: PropertyDescriptor;
};

type TestMongoIndexReadinessState = {
  readyModels: WeakSet<Model<any>>;
  inFlight: WeakMap<Model<any>, Promise<void>>;
  wrappedCollections: Map<object, SavedCollectionMethodDescriptor[]>;
  originalModelFn: Mongoose['model'];
};

const testReadinessStates = new WeakMap<Mongoose, TestMongoIndexReadinessState>();

// 仅在底层 model.collection 执行边界挂接就绪屏障：绝不改动业务 Schema middleware，同时覆盖 Model CRUD 与原生 collection 写入。
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
  if (state.readyModels.has(model)) {
    return Promise.resolve();
  }
  if (model.schema.get('autoIndex') === false) {
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
        // 建索引失败时保留重试机会，不把失败模型错误标记为 ready。
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
  const innerIter = method.apply(receiver, args);
  for await (const doc of innerIter) {
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
  if (
    collection === undefined ||
    collection === null ||
    typeof collection !== 'object' ||
    state.wrappedCollections.has(collection)
  ) {
    return;
  }

  const savedDescriptors: SavedCollectionMethodDescriptor[] = [];
  const isFastPathReady = () =>
    testReadinessStates.get(client) !== state ||
    state.readyModels.has(model) ||
    model.schema.get('autoIndex') === false ||
    client.connection.readyState !== 1;

  const waitReady = () => ensureModelIndexesReady({ client, state, model });

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
        // 立刻触发建索引并把 Promise 收敛进 state.inFlight，后续 Mongoose 与原生 collection 操作共用同一期约。
        void ensureModelIndexesReady({ client, state, model }).catch(() => undefined);
      }
    }
    return model;
  } as unknown as Mongoose['model'];
};

/**
 * 为测试客户端显式确保当前已注册模型的索引全部就绪。
 *
 * - 自动跳过 `schema.get('autoIndex') === false` 的显式禁用场景（用于测试缺索引或手工建索引逻辑）；
 * - 若客户端已调用 {@link enableTestMongoIndexReadiness}，则复用同一份 `readyModels` / `inFlight` 状态去重。
 */
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

/**
 * 启用共享的测试态 Mongo 索引就绪契约（主仓、Pro 与集成测试装配层统一入口）：
 * - 显式关闭 Mongoose 连接级 `autoIndex`（避免后台无等待异步建索引造成唯一键竞态）；
 * - 立即为所有已加载模型执行并等待 `createIndexes()`；
 * - 拦截 `client.model(...)` 为延迟注册的模型底层 `model.collection` 挂入就绪屏障，
 *   在不修改任何业务 Schema middleware 的前提下同时覆盖 Mongoose Model CRUD 与原生 `Model.collection` 写入。
 */
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

/**
 * 清理并恢复测试客户端上的 `client.model` 与 `model.collection` 拦截及状态缓存（通常在 `afterAll` 断开连接前调用）。
 */
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

    (client as { model: Mongoose['model'] }).model = state.originalModelFn;
    testReadinessStates.delete(client);
  }
};
