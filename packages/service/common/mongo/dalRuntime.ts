import { createMongoRuntimeDeps } from '@fastgpt/dal/db/mongo/runtime';
import { configureDbRuntime, type DbRuntime } from '@fastgpt/dal/db/runtime';
import type { DbTransactionRunner } from '@fastgpt/dal/db/types';
import { serviceEnv } from '../../env';
import { getLogger, LogCategories } from '../logger';
import { isProfiling, recordMongoOperation } from '../profiling';
import { connectionLogMongo, connectionMongo, MONGO_URL } from './index';

const logger = getLogger(LogCategories.INFRA.MONGO);

/**
 * 将当前进程的 MongoDB 连接拓扑注入 `@fastgpt/dal` 数据库 Runtime。
 *
 * 日志数据源遵循三态拓扑：
 * - 配置 `logWriteUrl` / `MONGODB_LOG_URI`：`separate` 模式，使用独立日志连接实例；
 * - 未配置且未显式禁用（默认）：`shared` 模式，直接复用 `main` 连接实例；
 * - 显式传入 `logDisabled: true`：`disabled` 模式，日志仓储路由至 `Noop` 空实现。
 */
export const configureMongoDalRuntime = (options?: {
  mainWriteUrl?: string;
  logWriteUrl?: string;
  logDisabled?: boolean;
  transactionRunner?: DbTransactionRunner;
}): DbRuntime => {
  const mainWriteUrl = options?.mainWriteUrl ?? process.env.MONGODB_URI ?? MONGO_URL;
  const logDisabled = options?.logDisabled === true;
  const logWriteUrl = logDisabled
    ? undefined
    : options !== undefined && 'logWriteUrl' in options
      ? options.logWriteUrl
      : (process.env.MONGODB_LOG_URI ?? serviceEnv.MONGODB_LOG_URI);

  const mongoDeps = createMongoRuntimeDeps({
    getMainClient: () => connectionMongo,
    getLogClient: () =>
      !logDisabled && logWriteUrl !== undefined && logWriteUrl.trim().length > 0
        ? connectionLogMongo
        : undefined
  });

  return configureDbRuntime({
    dialect: 'mongo',
    mainWriteUrl,
    logWriteUrl,
    logDisabled,
    maxConnections: serviceEnv.DB_MAX_LINK,
    logger,
    metrics: {
      operationCompleted: ({ table, durationMs }) => {
        if (isProfiling()) {
          recordMongoOperation({
            collectionName: table,
            durationMs
          });
        }
      }
    },
    mongoModelBinder: mongoDeps.mongoModelBinder,
    healthChecker: mongoDeps.healthChecker,
    transactionRunner: options?.transactionRunner ?? mongoDeps.transactionRunner
  });
};
