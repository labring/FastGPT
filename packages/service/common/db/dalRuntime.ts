import { createMongoRuntimeDeps, getSharedMongoLogConnection } from '@fastgpt/dal/db/mongo/runtime';
import { createOceanBaseRuntimeDeps } from '@fastgpt/dal/db/oceanbase/runtime';
import { DbConfigurationError } from '@fastgpt/dal/db/errors';
import { configureDbRuntime, type DbRuntime } from '@fastgpt/dal/db/runtime';
import type { DbDialect, DbTransactionRunner } from '@fastgpt/dal/db/types';
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

const resolveDistinctOptionalUrl = (mainUrl: string, rawUrl?: string): string | undefined => {
  const trimmed = rawUrl?.trim() ?? '';
  return trimmed.length > 0 && trimmed !== mainUrl ? trimmed : undefined;
};

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
    const normalizedMainUrl = rawMainUrl?.trim() ?? '';
    if (normalizedMainUrl.length === 0) {
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

    const effectiveLogWriteUrl = resolveDistinctOptionalUrl(normalizedMainUrl, rawLogUrl);
    const effectiveMainReadUrl = resolveDistinctOptionalUrl(normalizedMainUrl, rawReadUrl);

    const oceanBaseDeps = createOceanBaseRuntimeDeps({
      mainWriteUrl: normalizedMainUrl,
      mainReadUrl: effectiveMainReadUrl,
      logWriteUrl: effectiveLogWriteUrl,
      maxConnections
    });

    const oceanBaseLogger = getLogger(LogCategories.INFRA.OCEANBASE ?? LogCategories.INFRA.MONGO);

    return configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: normalizedMainUrl,
      mainReadUrl: effectiveMainReadUrl,
      logWriteUrl: effectiveLogWriteUrl,
      maxConnections,
      logger: oceanBaseLogger,
      metrics,
      oceanBaseExecutorResolver: oceanBaseDeps.oceanBaseExecutorResolver,
      transactionRunner: options?.transactionRunner ?? oceanBaseDeps.transactionRunner,
      closeHandler: oceanBaseDeps.closeHandler
    });
  }

  const mainWriteUrl = options?.mainWriteUrl ?? process.env.MONGODB_URI ?? MONGO_URL;
  const normalizedMainUrl = mainWriteUrl.trim();
  const rawLogWriteUrl =
    options !== undefined && 'logWriteUrl' in options
      ? options.logWriteUrl
      : (process.env.MONGODB_LOG_URI ?? serviceEnv.MONGODB_LOG_URI);
  // 仅当日志库连接串非空且与主库不同时进入 separate 模式；与主库同串时按 shared 单池处理。
  const effectiveLogWriteUrl = resolveDistinctOptionalUrl(normalizedMainUrl, rawLogWriteUrl);

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
    mainWriteUrl: normalizedMainUrl,
    logWriteUrl: effectiveLogWriteUrl,
    maxConnections,
    logger: getLogger(LogCategories.INFRA.MONGO),
    metrics,
    mongoModelBinder: mongoDeps.mongoModelBinder,
    transactionRunner: options?.transactionRunner ?? mongoDeps.transactionRunner
  });
};
