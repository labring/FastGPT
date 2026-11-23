import { createMongoRuntimeDeps, getSharedMongoLogConnection } from '@fastgpt/dal/db/mongo/runtime';
import { configureDbRuntime, type DbRuntime } from '@fastgpt/dal/db/runtime';
import type { DbTransactionRunner } from '@fastgpt/dal/db/types';
import { serviceEnv } from '../../env';
import { getLogger, LogCategories } from '../logger';
import { isProfiling, recordMongoOperation } from '../profiling';
import { connectionLogMongo, connectionMongo, hasSeparateMongoLogUri, MONGO_URL } from './index';

const logger = getLogger(LogCategories.INFRA.MONGO);

/**
 * 将当前进程的 MongoDB 连接拓扑注入 `@fastgpt/dal` 数据库 Runtime。
 *
 * 日志数据源遵循双态拓扑：
 * - 配置与主库不同的 `logWriteUrl` / `MONGODB_LOG_URI`：`separate` 模式，使用独立日志连接实例；
 * - 未配置或与主库相同时（默认）：`shared` 模式，透明回退复用 `main` 连接实例（不重复建池）。
 */
export const configureMongoDalRuntime = (options?: {
  mainWriteUrl?: string;
  logWriteUrl?: string;
  transactionRunner?: DbTransactionRunner;
}): DbRuntime => {
  const mainWriteUrl = options?.mainWriteUrl ?? process.env.MONGODB_URI ?? MONGO_URL;
  const rawLogWriteUrl =
    options !== undefined && 'logWriteUrl' in options
      ? options.logWriteUrl
      : (process.env.MONGODB_LOG_URI ?? serviceEnv.MONGODB_LOG_URI);
  const normalizedMainUrl = mainWriteUrl.trim();
  const normalizedLogUrl = rawLogWriteUrl?.trim() ?? '';
  // 仅当日志库连接串非空且与主库不同时进入 separate 模式；与主库同串时按 shared 单池处理。
  const effectiveLogWriteUrl =
    normalizedLogUrl.length > 0 && normalizedLogUrl !== normalizedMainUrl
      ? normalizedLogUrl
      : undefined;

  const mongoDeps = createMongoRuntimeDeps({
    getMainClient: () => connectionMongo,
    getLogClient: () =>
      effectiveLogWriteUrl !== undefined
        ? hasSeparateMongoLogUri
          ? connectionLogMongo
          : getSharedMongoLogConnection()
        : undefined
  });

  return configureDbRuntime({
    dialect: 'mongo',
    mainWriteUrl,
    logWriteUrl: effectiveLogWriteUrl,
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
