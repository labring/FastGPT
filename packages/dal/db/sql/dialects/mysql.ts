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
 * 强制使用 `timezone: 'Z'` 保持跨库 UTC 时间行为一致；遵循日志三态拓扑：
 * - 配置 `logWriteUrl`（`separate`）：建立独立日志连接池；
 * - 未配置 `logWriteUrl` 且未禁用（默认 `shared`）：直接复用 `main` 连接池（不重复建池）；
 * - 显式 `logDisabled: true`（`disabled`）：拒绝 log 连接请求并由容器路由至 `Noop`。
 */
export const createMysqlKyselyRuntimeDeps = ({
  mainWriteUrl,
  mainReadUrl,
  logWriteUrl,
  logReadUrl,
  logDisabled = false,
  maxConnections = DEFAULT_MYSQL_POOL_LIMIT
}: {
  mainWriteUrl: string;
  mainReadUrl?: string;
  logWriteUrl?: string;
  logReadUrl?: string;
  logDisabled?: boolean;
  maxConnections?: number;
}): MysqlRuntimeDeps => {
  const mainWriteDb = createMysqlKysely(mainWriteUrl, maxConnections);
  const mainReadDb =
    mainReadUrl !== undefined && mainReadUrl.trim().length > 0
      ? createMysqlKysely(mainReadUrl, maxConnections)
      : undefined;

  const hasSeparateLog = !logDisabled && logWriteUrl !== undefined && logWriteUrl.trim().length > 0;
  const logWriteDb = hasSeparateLog ? createMysqlKysely(logWriteUrl, maxConnections) : undefined;
  const logReadDb =
    hasSeparateLog && logReadUrl !== undefined && logReadUrl.trim().length > 0
      ? createMysqlKysely(logReadUrl, maxConnections)
      : undefined;

  const resolvePoolDb = (
    datasource: DbDatasource,
    target: 'write' | 'readReplica'
  ): Kysely<any> => {
    if (datasource === 'log') {
      if (logDisabled) {
        throw new DbLogDatasourceNotConfiguredError();
      }
      if (logWriteDb !== undefined) {
        if (target === 'readReplica' && logReadDb !== undefined) {
          return logReadDb;
        }
        return logWriteDb;
      }
      // shared 模式复用主库连接池，不重复建池
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
