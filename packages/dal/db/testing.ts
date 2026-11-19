import { PGlite } from '@electric-sql/pglite';
import { Kysely, PGliteDialect, sql } from 'kysely';
import { closeDbRuntime, configureDbRuntime } from './runtime';
import { compileSqlTableDDL, type SqlTableDefinition } from './sql/ddl';
import type { DbDialect } from './types';

export type SqlTestHarness = {
  db: Kysely<any>;
  logDb?: Kysely<any>;
  truncateAll: () => Promise<void>;
  close: () => Promise<void>;
};

const createKyselyOverPGlite = async (
  tables: readonly SqlTableDefinition[]
): Promise<{ pglite: PGlite; db: Kysely<any> }> => {
  const pglite = new PGlite();
  await pglite.waitReady;

  const db = new Kysely<any>({
    dialect: new PGliteDialect({ pglite })
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
 * 通过统一的 `compileSqlTableDDL` 建表，确保迁移脚本与业务仓储测试基于同一套可移植表定义。
 */
export const createPGliteSqlTestHarness = async ({
  tables,
  logTables,
  withLogDatabase = false
}: {
  tables: readonly SqlTableDefinition[];
  logTables?: readonly SqlTableDefinition[];
  withLogDatabase?: boolean;
}): Promise<SqlTestHarness> => {
  await closeDbRuntime();

  const main = await createKyselyOverPGlite(tables);
  const log = withLogDatabase ? await createKyselyOverPGlite(logTables ?? []) : undefined;

  configureDbRuntime({
    dialect: 'postgres',
    mainWriteUrl: 'pglite://memory/main',
    ...(withLogDatabase ? { logWriteUrl: 'pglite://memory/log' } : {}),
    sqlExecutorResolver: ({ datasource, nativeTx }) => {
      if (nativeTx !== undefined) {
        return nativeTx;
      }
      if (datasource === 'log') {
        return log?.db;
      }
      return main.db;
    },
    transactionRunner: async ({ datasource, execute }) => {
      const targetDb = datasource === 'log' ? log?.db : main.db;
      if (targetDb === undefined) {
        throw new Error('Log PGlite instance is not initialized');
      }
      return targetDb.transaction().execute(async (trx) => execute(trx));
    },
    healthChecker: async (datasource) => {
      const targetDb = datasource === 'log' ? log?.db : main.db;
      if (targetDb !== undefined) {
        await sql`SELECT 1`.execute(targetDb);
      }
    }
  });

  const allTableNames = [
    ...tables.map((t) => ({ name: t.name, target: main.db })),
    ...(log !== undefined ? (logTables ?? []).map((t) => ({ name: t.name, target: log.db })) : [])
  ];

  return {
    db: main.db,
    logDb: log?.db,
    truncateAll: async () => {
      for (const item of allTableNames) {
        await sql.raw(`TRUNCATE TABLE "${item.name}" CASCADE`).execute(item.target);
      }
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
 * 声明双数据库（Mongo + SQL）共享契约测试矩阵。
 *
 * 传入同一套测试回调，自动在每个配置的后端上完整重放，强制保证空值语义、唯一约束冲突、
 * 软删除/租户隔离、事务回滚与 `afterCommit` 在不同数据库间 100% 行为一致。
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
  backends: ReadonlyArray<{
    label: string;
    dialect: DbDialect;
    setup: () => Promise<void>;
    cleanupEach?: () => Promise<void>;
    teardown: () => Promise<void>;
  }>;
  registerTests: (getDialect: () => DbDialect) => void;
}): void => {
  for (const backend of backends) {
    describeFn(`[${backend.label}]`, () => {
      beforeAllFn(backend.setup);
      if (beforeEachFn !== undefined && backend.cleanupEach !== undefined) {
        beforeEachFn(backend.cleanupEach);
      }
      afterAllFn(backend.teardown);
      registerTests(() => backend.dialect);
    });
  }
};
