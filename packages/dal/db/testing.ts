import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { Kysely, MysqlDialect, PGliteDialect, PostgresDialect, sql, type MysqlPool } from 'kysely';
import { Mongoose, type Model } from 'mongoose';
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
