import { createMongoTransactionRunner } from '@fastgpt/dal/db/mongo/base';
import { configureDbRuntime, type DbRuntime } from '@fastgpt/dal/db/runtime';
import type { DbTransactionRunner } from '@fastgpt/dal/db/types';
import { serviceEnv } from '../../env';
import { getLogger, LogCategories } from '../logger';
import { connectionLogMongo, connectionMongo, MONGO_URL } from './index';

const logger = getLogger(LogCategories.INFRA.MONGO);

/**
 * 将当前进程的 MongoDB 连接拓扑注入 `@fastgpt/dal` 数据库 Runtime。
 *
 * 注意：`logWriteUrl` 直接读取原始 `serviceEnv.MONGODB_LOG_URI`（不回退至 `MONGO_URL`），
 * 因此未显式配置独立日志库时，`hasLogDatabase()` 为 `false`，新迁移的日志类仓储自动走 `Noop` 空实现。
 */
export const configureMongoDalRuntime = (options?: {
  mainWriteUrl?: string;
  logWriteUrl?: string;
  transactionRunner?: DbTransactionRunner;
}): DbRuntime => {
  const mainWriteUrl = options?.mainWriteUrl ?? process.env.MONGODB_URI ?? MONGO_URL;
  const logWriteUrl =
    options !== undefined && 'logWriteUrl' in options
      ? options.logWriteUrl
      : (process.env.MONGODB_LOG_URI ?? serviceEnv.MONGODB_LOG_URI);

  return configureDbRuntime({
    dialect: 'mongo',
    mainWriteUrl,
    logWriteUrl,
    maxConnections: serviceEnv.DB_MAX_LINK,
    logger,
    transactionRunner:
      options?.transactionRunner ??
      createMongoTransactionRunner({
        getMainClient: () => connectionMongo,
        getLogClient: () =>
          logWriteUrl !== undefined && logWriteUrl.trim().length > 0
            ? connectionLogMongo
            : undefined
      })
  });
};
