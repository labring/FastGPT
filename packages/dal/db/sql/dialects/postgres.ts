import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { DbLogDatasourceNotConfiguredError } from '../../errors';
import type { DbDatasource, DbTransactionRunner, SqlExecutorResolver } from '../../types';

export type PostgresRuntimeDeps = {
  transactionRunner: DbTransactionRunner;
  sqlExecutorResolver: SqlExecutorResolver<Kysely<any>>;
  healthChecker: (datasource: DbDatasource) => Promise<void>;
  closeHandler: () => Promise<void>;
};

const DEFAULT_PG_POOL_MAX = 20;

const createPgKysely = (url: string, max: number): Kysely<any> =>
  new Kysely<any>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: url,
        max
      })
    })
  });

/**
 * 构建基于 `pg.Pool` + Kysely `PostgresDialect` 的数据库底座运行时依赖。
 *
 * 严格遵守独立日志库隔离契约：当 `logWriteUrl` 未配置或为空时，绝不创建日志库连接池。
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
  const mainWriteDb = createPgKysely(mainWriteUrl, maxConnections);
  const mainReadDb =
    mainReadUrl !== undefined && mainReadUrl.trim().length > 0
      ? createPgKysely(mainReadUrl, maxConnections)
      : undefined;

  const hasLog = logWriteUrl !== undefined && logWriteUrl.trim().length > 0;
  const logWriteDb = hasLog ? createPgKysely(logWriteUrl, maxConnections) : undefined;
  const logReadDb =
    hasLog && logReadUrl !== undefined && logReadUrl.trim().length > 0
      ? createPgKysely(logReadUrl, maxConnections)
      : undefined;

  const resolvePoolDb = (
    datasource: DbDatasource,
    target: 'write' | 'readReplica'
  ): Kysely<any> => {
    if (datasource === 'log') {
      if (logWriteDb === undefined) {
        throw new DbLogDatasourceNotConfiguredError();
      }
      if (target === 'readReplica' && logReadDb !== undefined) {
        return logReadDb;
      }
      return logWriteDb;
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
