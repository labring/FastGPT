import { createMongoRuntimeDeps, getSharedMongoLogConnection } from '@fastgpt/dal/db/mongo/runtime';
import { createOceanBaseRuntimeDeps } from '@fastgpt/dal/db/oceanbase/runtime';
import { DbConfigurationError } from '@fastgpt/dal/db/errors';
import {
  closeDbRuntime,
  configureDbRuntime,
  normalizeDbTopologyUrls,
  type DbRuntime
} from '@fastgpt/dal/db/runtime';
import type { DbDialect, DbTransactionRunner } from '@fastgpt/dal/db/types';
import {
  registerRedisRuntimeShutdown,
  type RedisRuntimeShutdownOptions
} from '@fastgpt/dal/redis/runtime';
import { serviceEnv } from '../../env';
import { getLogger, LogCategories } from '../logger';
import { isProfiling, recordMongoOperation } from '../profiling';
import {
  connectionLogMongo,
  connectionMongo,
  hasSeparateMongoLogUri,
  MONGO_URL
} from '../mongo/index';

export type ConfigureDalRuntimeOptions = {
  dialect?: DbDialect;
  mainWriteUrl?: string;
  mainReadUrl?: string;
  logWriteUrl?: string;
  maxConnections?: number;
  transactionRunner?: DbTransactionRunner;
};

const closeConfiguredDbRuntime = () => closeDbRuntime();

/**
 * 注册进程级 DAL（Redis + Database）统一优雅关闭处理器（供 `projects/app` 与 `pro/admin` 共用）。
 * 在同一次 SIGTERM/SIGINT 回调中等待 Redis 与 `DbRuntime` 均关闭后再决定退出码，避免多监听器抢先退出。
 */
export const registerDalRuntimeShutdown = (
  options: Omit<RedisRuntimeShutdownOptions, 'onShutdown'> = {}
) =>
  registerRedisRuntimeShutdown({
    ...options,
    onShutdown: closeConfiguredDbRuntime
  });

/**
 * 进程级双引擎 DAL Runtime 统一装配入口（供 `projects/app`、`pro/admin` 与测试启动层复用）。
 *
 * - 默认按 `serviceEnv.DB_DIALECT`（默认 `mongo`）装配对应方言驱动、连接拓扑与观测上报；
 * - `oceanbase` 模式下严格读取 `OCEANBASE_DB_URI` / `OCEANBASE_LOG_DB_URI` / `OCEANBASE_DB_READ_URI`，
 *   绝不回退或共享向量库 `OCEANBASE_URL` / `SEEKDB_URL`；
 * - 日志数据源遵循 `shared`（未配置或与主库同串时透明复用主库）与 `separate` 双态拓扑。
 */
export const configureDalRuntime = (options?: ConfigureDalRuntimeOptions): DbRuntime => {
  const dialect = options?.dialect ?? serviceEnv.DB_DIALECT;
  const maxConnections = options?.maxConnections ?? serviceEnv.DB_MAX_LINK;

  const metrics = {
    operationCompleted: ({ table, durationMs }: { table?: string; durationMs: number }) => {
      if (isProfiling()) {
        recordMongoOperation({
          collectionName: table,
          durationMs
        });
      }
    }
  };

  if (dialect === 'oceanbase') {
    const rawMainUrl =
      options?.mainWriteUrl ?? process.env.OCEANBASE_DB_URI ?? serviceEnv.OCEANBASE_DB_URI;
    if ((rawMainUrl?.trim() ?? '').length === 0) {
      throw new DbConfigurationError(
        'OCEANBASE_DB_URI must be configured when DB_DIALECT is "oceanbase" (vector DB OCEANBASE_URL / SEEKDB_URL is isolated and never used as fallback)'
      );
    }

    const rawLogUrl =
      options !== undefined && 'logWriteUrl' in options
        ? options.logWriteUrl
        : (process.env.OCEANBASE_LOG_DB_URI ?? serviceEnv.OCEANBASE_LOG_DB_URI);
    const rawReadUrl =
      options !== undefined && 'mainReadUrl' in options
        ? options.mainReadUrl
        : (process.env.OCEANBASE_DB_READ_URI ?? serviceEnv.OCEANBASE_DB_READ_URI);

    const topology = normalizeDbTopologyUrls({
      mainWriteUrl: rawMainUrl,
      mainReadUrl: rawReadUrl,
      logWriteUrl: rawLogUrl
    });

    const oceanBaseDeps = createOceanBaseRuntimeDeps({
      ...topology,
      maxConnections
    });

    const oceanBaseLogger = getLogger(LogCategories.INFRA.OCEANBASE ?? LogCategories.INFRA.MONGO);

    return configureDbRuntime({
      dialect: 'oceanbase',
      ...topology,
      maxConnections,
      logger: oceanBaseLogger,
      metrics,
      oceanBaseExecutorResolver: oceanBaseDeps.oceanBaseExecutorResolver,
      transactionRunner: options?.transactionRunner ?? oceanBaseDeps.transactionRunner,
      closeHandler: oceanBaseDeps.closeHandler
    });
  }

  const mainWriteUrl = options?.mainWriteUrl ?? process.env.MONGODB_URI ?? MONGO_URL;
  const rawLogWriteUrl =
    options !== undefined && 'logWriteUrl' in options
      ? options.logWriteUrl
      : (process.env.MONGODB_LOG_URI ?? serviceEnv.MONGODB_LOG_URI);
  // 仅当日志库连接串非空且与主库不同时进入 separate 模式；与主库同串时按 shared 单池处理。
  const topology = normalizeDbTopologyUrls({
    mainWriteUrl,
    logWriteUrl: rawLogWriteUrl
  });

  const mongoDeps = createMongoRuntimeDeps({
    getMainClient: () => connectionMongo,
    getLogClient: () =>
      topology.logWriteUrl !== undefined
        ? hasSeparateMongoLogUri
          ? connectionLogMongo
          : getSharedMongoLogConnection()
        : undefined
  });

  return configureDbRuntime({
    dialect: 'mongo',
    mainWriteUrl: topology.mainWriteUrl,
    logWriteUrl: topology.logWriteUrl,
    maxConnections,
    logger: getLogger(LogCategories.INFRA.MONGO),
    metrics,
    mongoModelBinder: mongoDeps.mongoModelBinder,
    transactionRunner: options?.transactionRunner ?? mongoDeps.transactionRunner
  });
};
