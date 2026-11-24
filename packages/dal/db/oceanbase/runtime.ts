import { Kysely, MysqlDialect, type MysqlPool } from 'kysely';
import { createPool } from 'mysql2';
import type { DbDatasource, DbTransactionRunner, OceanBaseExecutorResolver } from '../types';

export type OceanBaseRuntimeDeps = {
  transactionRunner: DbTransactionRunner;
  oceanBaseExecutorResolver: OceanBaseExecutorResolver<Kysely<any>>;
  closeHandler: () => Promise<void>;
};

const DEFAULT_OCEANBASE_POOL_LIMIT = 10;

const createOceanBaseKysely = ({
  url,
  connectionLimit
}: {
  url: string;
  connectionLimit: number;
}): Kysely<any> =>
  new Kysely<any>({
    dialect: new MysqlDialect({
      pool: createPool({
        uri: url,
        connectionLimit,
        waitForConnections: true,
        timezone: 'Z',
        charset: 'utf8mb4',
        supportBigNumbers: true,
        bigNumberStrings: true
      }) as unknown as MysqlPool
    })
  });

/**
 * 构建基于 `mysql2` + Kysely 的轻量 OceanBase 运行时依赖（当前用于测试与契约验证）。
 * 遵循日志双态拓扑：配置 `logWriteUrl` 进入独立池，未配置则透明复用主池。
 */
export const createOceanBaseRuntimeDeps = ({
  mainWriteUrl,
  logWriteUrl,
  maxConnections = DEFAULT_OCEANBASE_POOL_LIMIT
}: {
  mainWriteUrl: string;
  logWriteUrl?: string;
  maxConnections?: number;
}): OceanBaseRuntimeDeps => {
  const mainDb = createOceanBaseKysely({ url: mainWriteUrl, connectionLimit: maxConnections });
  const logDb =
    logWriteUrl !== undefined && logWriteUrl.trim().length > 0
      ? createOceanBaseKysely({ url: logWriteUrl, connectionLimit: maxConnections })
      : undefined;

  const resolvePoolDb = (datasource: DbDatasource): Kysely<any> =>
    datasource === 'log' && logDb !== undefined ? logDb : mainDb;

  return {
    oceanBaseExecutorResolver: ({ datasource, nativeTx }) =>
      nativeTx !== undefined ? (nativeTx as Kysely<any>) : resolvePoolDb(datasource),

    transactionRunner: async ({ datasource, execute }) =>
      resolvePoolDb(datasource)
        .transaction()
        .execute((trx) => execute(trx)),

    closeHandler: async () => {
      await Promise.all(
        [mainDb, logDb]
          .filter((db): db is Kysely<any> => db !== undefined)
          .map((db) => db.destroy())
      );
    }
  };
};
