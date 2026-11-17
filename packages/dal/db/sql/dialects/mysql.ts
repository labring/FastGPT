import { Kysely, MysqlDialect, sql, type MysqlPool } from 'kysely';
import { createPool } from 'mysql2';
import { DbLogDatasourceNotConfiguredError } from '../../errors';
import type { DbDatasource, DbTransactionRunner, SqlExecutorResolver } from '../../types';

export type MysqlRuntimeDeps = {
  transactionRunner: DbTransactionRunner;
  sqlExecutorResolver: SqlExecutorResolver<Kysely<any>>;
  healthChecker: (datasource: DbDatasource) => Promise<void>;
  closeHandler: () => Promise<void>;
};

const DEFAULT_MYSQL_POOL_LIMIT = 20;

const createMysqlKysely = (url: string, connectionLimit: number): Kysely<any> =>
  new Kysely<any>({
    dialect: new MysqlDialect({
      pool: createPool({
        uri: url,
        connectionLimit,
        waitForConnections: true,
        enableKeepAlive: true,
        timezone: 'Z'
      }) as unknown as MysqlPool
    })
  });

/**
 * 构建基于 `mysql2` + Kysely `MysqlDialect` 的运行时依赖（通吃 OceanBase、SeekDB 与 MySQL 8+）。
 *
 * 强制使用 `timezone: 'Z'` 保持跨库 UTC 时间行为一致；当 `logWriteUrl` 未配置时不创建日志库连接池。
 */
export const createMysqlKyselyRuntimeDeps = ({
  mainWriteUrl,
  mainReadUrl,
  logWriteUrl,
  logReadUrl,
  maxConnections = DEFAULT_MYSQL_POOL_LIMIT
}: {
  mainWriteUrl: string;
  mainReadUrl?: string;
  logWriteUrl?: string;
  logReadUrl?: string;
  maxConnections?: number;
}): MysqlRuntimeDeps => {
  const mainWriteDb = createMysqlKysely(mainWriteUrl, maxConnections);
  const mainReadDb =
    mainReadUrl !== undefined && mainReadUrl.trim().length > 0
      ? createMysqlKysely(mainReadUrl, maxConnections)
      : undefined;

  const hasLog = logWriteUrl !== undefined && logWriteUrl.trim().length > 0;
  const logWriteDb = hasLog ? createMysqlKysely(logWriteUrl, maxConnections) : undefined;
  const logReadDb =
    hasLog && logReadUrl !== undefined && logReadUrl.trim().length > 0
      ? createMysqlKysely(logReadUrl, maxConnections)
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

    transactionRunner: async ({ datasource, execute }) => {
      const writeDb = resolvePoolDb(datasource, 'write');
      return writeDb.transaction().execute(async (trx) => execute(trx));
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
