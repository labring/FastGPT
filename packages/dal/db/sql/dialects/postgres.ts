import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import type { DbDatasource, DbTransactionRunner, SqlExecutorResolver } from '../../types';
import { createSqlQueryLogger } from '../observability';

export type PostgresRuntimeDeps = {
  transactionRunner: DbTransactionRunner;
  sqlExecutorResolver: SqlExecutorResolver<Kysely<any>>;
  healthChecker: (datasource: DbDatasource) => Promise<void>;
  closeHandler: () => Promise<void>;
};

const DEFAULT_PG_POOL_MAX = 20;

const createPgKysely = ({
  url,
  max,
  datasource
}: {
  url: string;
  max: number;
  datasource: DbDatasource;
}): Kysely<any> =>
  new Kysely<any>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: url,
        max
      })
    }),
    log: createSqlQueryLogger(datasource)
  });

/**
 * 构建基于 `pg.Pool` + Kysely `PostgresDialect` 的数据库底座运行时依赖。
 *
 * 自动挂载统一慢查询与 Profiling 观测监听器；遵循日志双态拓扑：
 * - 配置 `logWriteUrl`（`separate`）：建立独立日志连接池；
 * - 未配置 `logWriteUrl`（默认 `shared`）：透明回退复用 `main` 连接池（不重复建池）。
 */
export const createPostgresKyselyRuntimeDeps = ({
  mainWriteUrl,
  mainReadUrl,
  logWriteUrl,
  logReadUrl,
  maxConnections = DEFAULT_PG_POOL_MAX
}: {
  mainWriteUrl: string;
  mainReadUrl?: string;
  logWriteUrl?: string;
  logReadUrl?: string;
  maxConnections?: number;
}): PostgresRuntimeDeps => {
  const mainWriteDb = createPgKysely({
    url: mainWriteUrl,
    max: maxConnections,
    datasource: 'main'
  });
  const mainReadDb =
    mainReadUrl !== undefined && mainReadUrl.trim().length > 0
      ? createPgKysely({
          url: mainReadUrl,
          max: maxConnections,
          datasource: 'main'
        })
      : undefined;

  const hasSeparateLog = logWriteUrl !== undefined && logWriteUrl.trim().length > 0;
  const logWriteDb = hasSeparateLog
    ? createPgKysely({
        url: logWriteUrl,
        max: maxConnections,
        datasource: 'log'
      })
    : undefined;
  const logReadDb =
    hasSeparateLog && logReadUrl !== undefined && logReadUrl.trim().length > 0
      ? createPgKysely({
          url: logReadUrl,
          max: maxConnections,
          datasource: 'log'
        })
      : undefined;

  const resolvePoolDb = (
    datasource: DbDatasource,
    target: 'write' | 'readReplica'
  ): Kysely<any> => {
    if (datasource === 'log') {
      if (logWriteDb !== undefined) {
        if (target === 'readReplica' && logReadDb !== undefined) {
          return logReadDb;
        }
        return logWriteDb;
      }
      // shared 模式默认回退复用主库连接池，不重复建池
      if (target === 'readReplica' && mainReadDb !== undefined) {
        return mainReadDb;
      }
      return mainWriteDb;
    }
    if (target === 'readReplica' && mainReadDb !== undefined) {
      return mainReadDb;
    }
    return mainWriteDb;
  };

  return {
    sqlExecutorResolver: ({ datasource, target, nativeTx }) => {
      if (nativeTx !== undefined) {
        return nativeTx as Kysely<any>;
      }
      return resolvePoolDb(datasource, target);
    },

    transactionRunner: async ({ datasource, timeoutMs, execute }) => {
      const writeDb = resolvePoolDb(datasource, 'write');
      return writeDb.transaction().execute(async (trx) => {
        if (Number.isSafeInteger(timeoutMs) && timeoutMs > 0) {
          await sql.raw(`SET LOCAL statement_timeout = ${Math.floor(timeoutMs)}`).execute(trx);
        }
        return execute(trx);
      });
    },

    healthChecker: async (datasource) => {
      const targetDb = resolvePoolDb(datasource, 'write');
      await sql`SELECT 1`.execute(targetDb);
    },

    closeHandler: async () => {
      const dbs = [mainWriteDb, mainReadDb, logWriteDb, logReadDb].filter(
        (db): db is Kysely<any> => db !== undefined
      );
      await Promise.all(dbs.map((db) => db.destroy()));
    }
  };
};
