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
import { createMysqlKyselyRuntimeDeps } from './sql/dialects/mysql';
import { createPostgresKyselyRuntimeDeps } from './sql/dialects/postgres';
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
 * 优先复用外部传入 `uri` 或 `FASTGPT_TEST_MONGODB_URI`（按 Worker + 随机库名隔离，测试结束自动 dropDatabase）；
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
  let replSet: { stop: () => Promise<boolean> } | undefined;
  let baseUri: string;

  if (externalUri !== undefined && externalUri.trim().length > 0) {
    baseUri = externalUri.trim();
  } else {
    const started = await startMongoMemoryReplSetWithRetry();
    replSet = started;
    baseUri = started.getUri();
  }

  const mainUrl = withDatabaseNameInUrl(baseUri, buildWorkerIsolatedDatabaseName('fg_dal_main'));
  const logUrl =
    logMode === 'separate'
      ? withDatabaseNameInUrl(baseUri, buildWorkerIsolatedDatabaseName('fg_dal_log'))
      : undefined;

  const mainClient = new Mongoose();
  mainClient.set('strictQuery', 'throw');
  mainClient.set('autoIndex', false);
  await mainClient.connect(mainUrl);

  let logClient: Mongoose | undefined;
  if (logUrl !== undefined) {
    logClient = new Mongoose();
    logClient.set('strictQuery', 'throw');
    logClient.set('autoIndex', false);
    await logClient.connect(logUrl);
  }

  const mongoDeps = createMongoRuntimeDeps({
    getMainClient: () => mainClient,
    getLogClient: () => logClient
  });

  const runtime = configureDbRuntime({
    dialect: 'mongo',
    mainWriteUrl: mainUrl,
    ...(logUrl !== undefined ? { logWriteUrl: logUrl } : {}),
    ...mongoDeps
  });

  const activeCollections: readonly MongoCollectionDefinition<any>[] = [
    ...collections,
    ...logCollections
  ];

  // Mongo 副本集多文档事务要求目标集合在事务开启前已存在
  const boundModels = activeCollections.map((col) => runtime.bindMongoModel<any, Model<any>>(col));
  for (const model of boundModels) {
    await model.createCollection().catch(() => undefined);
    await model.createIndexes().catch(() => undefined);
  }

  return {
    client: mainClient,
    logClient,
    getModel: <TDoc>(collection: MongoCollectionDefinition<TDoc>) =>
      getDbRuntime().bindMongoModel<TDoc, Model<TDoc>>(collection),
    insertRawRow: async ({ collection, doc, datasource = 'main' }) => {
      const targetClient = datasource === 'log' && logClient !== undefined ? logClient : mainClient;
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
      if (externalUri !== undefined && externalUri.trim().length > 0) {
        await mainClient.connection.dropDatabase().catch(() => undefined);
        await logClient?.connection.dropDatabase().catch(() => undefined);
      }
      await mainClient.disconnect().catch(() => undefined);
      await logClient?.disconnect().catch(() => undefined);
      if (replSet !== undefined) {
        await replSet.stop();
      }
    }
  };
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

  for (const table of tables) {
    const statements = compileSqlTableDDL(table, 'postgres');
    for (const stmt of statements) {
      await sql.raw(stmt).execute(db);
    }
  }

  return { pglite, db };
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
  const main = await createKyselyOverPGlite(mainTables, 'main');
  const log =
    resolvedLogMode === 'separate'
      ? await createKyselyOverPGlite(logTables ?? [], 'log')
      : undefined;

  const resolveTargetDb = (datasource: DbDatasource): Kysely<any> => {
    if (datasource === 'log') {
      return log?.db ?? main.db;
    }
    return main.db;
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

  const managedTables = [
    ...mainTables.map((t) => ({ name: t.name, target: main.db })),
    ...(log !== undefined ? (logTables ?? []).map((t) => ({ name: t.name, target: log.db })) : [])
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
    db: main.db,
    logDb: log?.db ?? main.db,
    clearAll,
    truncateAll: clearAll,
    insertRawRow: async ({ table, row, datasource = 'main' }) => {
      await resolveTargetDb(datasource).insertInto(table).values(row).execute();
    },
    close: async () => {
      await closeDbRuntime();
      await main.db.destroy();
      if (log !== undefined) {
        await log.db.destroy();
      }
    }
  };
};

/**
 * 为真实 MySQL 8+ 或 OceanBase 4.3+ / SeekDB 创建按 Worker 隔离的独立库沙盒并注册 `DbRuntime`。
 *
 * 自动以 `utf8mb4_bin` 建库、执行 `compileSqlTableDDL`、用例间以无锁 `DELETE FROM` 清理，
 * 测试结束自动 `DROP DATABASE IF EXISTS` 并回收连接池。
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

  await sql
    .raw(
      `CREATE DATABASE IF NOT EXISTS ${quoteSqlIdentifier(mainDbName, dialect)} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;`
    )
    .execute(adminDb);
  if (logDbName !== undefined) {
    await sql
      .raw(
        `CREATE DATABASE IF NOT EXISTS ${quoteSqlIdentifier(logDbName, dialect)} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;`
      )
      .execute(adminDb);
  }

  const mainWriteUrl = withDatabaseNameInUrl(uri, mainDbName);
  const logWriteUrl = logDbName !== undefined ? withDatabaseNameInUrl(uri, logDbName) : undefined;
  const deps = createMysqlKyselyRuntimeDeps({
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
};

/**
 * 为真实 PostgreSQL >= 14 创建按 Worker 隔离的 Schema 沙盒并注册 `DbRuntime`。
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

  await sql
    .raw(`CREATE SCHEMA IF NOT EXISTS ${quoteSqlIdentifier(mainSchema, 'postgres')};`)
    .execute(adminDb);
  if (logSchema !== undefined) {
    await sql
      .raw(`CREATE SCHEMA IF NOT EXISTS ${quoteSqlIdentifier(logSchema, 'postgres')};`)
      .execute(adminDb);
  }

  const mainWriteUrl = withPostgresSearchPathInUrl(uri, mainSchema);
  const logWriteUrl =
    logSchema !== undefined ? withPostgresSearchPathInUrl(uri, logSchema) : undefined;
  const deps = createPostgresKyselyRuntimeDeps({
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
 * 按当前环境变量动态装配多数据库契约测试矩阵（MongoDB + PGlite + 可选 MySQL 8 / OceanBase / PostgreSQL）。
 *
 * - 本地零配置默认挂载 MongoDB（副本集）与 SQL（PGlite）；
 * - CI 或本地配置 `FASTGPT_TEST_MYSQL_URI` / `FASTGPT_TEST_OCEANBASE_URI` / `FASTGPT_TEST_PG_URI` 后，
 *   同一份契约测试自动重放到真实关系型引擎，无需任何测试代码改动。
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

  return backends;
};

/**
 * 声明多数据库共享契约测试矩阵（向测试回调提供统一 `ContractBackendContext`，含 `insertRawRow` 与并发能力标记）。
 */
export const registerMultiDialectContractSuite = ({
  describeFn,
  beforeAllFn,
  beforeEachFn,
  afterAllFn,
  backends,
  registerTests
}: {
  describeFn: (name: string, fn: () => void) => void;
  beforeAllFn: (fn: () => Promise<void>) => void;
  beforeEachFn?: (fn: () => Promise<void>) => void;
  afterAllFn: (fn: () => Promise<void>) => void;
  backends: readonly ContractBackendEntry[];
  registerTests: (ctx: ContractBackendContext) => void;
}): void => {
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
  registerTests
}: {
  describeFn: (name: string, fn: () => void) => void;
  beforeAllFn: (fn: () => Promise<void>) => void;
  beforeEachFn?: (fn: () => Promise<void>) => void;
  afterAllFn: (fn: () => Promise<void>) => void;
  backends: readonly ContractBackendEntry[];
  registerTests: (getDialect: () => DbDialect) => void;
}): void => {
  registerMultiDialectContractSuite({
    describeFn,
    beforeAllFn,
    beforeEachFn,
    afterAllFn,
    backends,
    registerTests: (ctx) => registerTests(ctx.getDialect)
  });
};
