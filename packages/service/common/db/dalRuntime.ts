import { createMongoRuntimeDeps, getSharedMongoLogConnection } from '@fastgpt/dal/db/mongo/runtime';
import {
  createOceanBaseRuntimeDeps,
  normalizeOceanBaseTopologyUrls
} from '@fastgpt/dal/db/oceanbase/runtime';
import { DbConfigurationError } from '@fastgpt/dal/db/errors';
import { closeDbRuntime, configureDbRuntime, type DbRuntime } from '@fastgpt/dal/db/runtime';
import type { DbDialect, DbLogger, DbTransactionRunner } from '@fastgpt/dal/db/types';
import { closeRedisRuntime } from '@fastgpt/dal/redis/runtime';
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

type ProcessSignalListener = (signal: NodeJS.Signals) => unknown;

export type ProcessShutdownTarget = {
  on: (signal: NodeJS.Signals, listener: ProcessSignalListener) => unknown;
  removeListener: (signal: NodeJS.Signals, listener: ProcessSignalListener) => unknown;
  listeners?: (signal: NodeJS.Signals) => ReadonlyArray<ProcessSignalListener>;
  exit: (code?: number) => void;
};

export type RegisterDalRuntimeShutdownOptions = {
  logger?: Pick<DbLogger, 'info' | 'warn' | 'error'>;
  processRef?: ProcessShutdownTarget;
  signals?: readonly NodeJS.Signals[];
  exitProcess?: boolean;
  /** 仅用于单测替换默认关闭动作；默认按同级资源并发关闭 Redis 与 Database Runtime。 */
  closeResources?: readonly (() => Promise<void> | void)[];
  /**
   * 仅当显式传入正数时启用框架排空上限（毫秒）。
   * 默认不设截断超时，避免长耗时 HTTP/SSE 请求排空期间提前关闭数据库连接池导致客户端 ECONNRESET。
   */
  frameworkShutdownTimeoutMs?: number;
};

type DalShutdownRegistration = {
  processRef: ProcessShutdownTarget;
  closeResources: readonly (() => Promise<void> | void)[];
  unregister: () => void;
};

type DalShutdownContext = {
  registration?: DalShutdownRegistration;
};

const DAL_SHUTDOWN_CONTEXT_SYMBOL = Symbol.for('@fastgpt/service/dal-runtime-shutdown');
const DEFAULT_SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;
const DEFAULT_DAL_CLOSE_RESOURCES: readonly (() => Promise<void>)[] = [
  closeRedisRuntime,
  closeDbRuntime
];

const silentShutdownLogger: Pick<DbLogger, 'info' | 'warn' | 'error'> = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

const getDalShutdownContext = (): DalShutdownContext => {
  const existing = Reflect.get(globalThis, DAL_SHUTDOWN_CONTEXT_SYMBOL) as
    | DalShutdownContext
    | undefined;
  if (existing !== undefined) {
    return existing;
  }
  const context: DalShutdownContext = {};
  Reflect.set(globalThis, DAL_SHUTDOWN_CONTEXT_SYMBOL, context);
  return context;
};

const createDeferredExitGate = (processRef: ProcessShutdownTarget) => {
  const originalExit = processRef.exit;
  const realExit = originalExit.bind(processRef);
  let requestedExitCode: number | undefined;
  let signaled = false;
  let resolveExit!: () => void;
  const exitRequested = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  const interceptedExit = (code?: number) => {
    if (signaled) return;
    signaled = true;
    requestedExitCode = code;
    resolveExit();
  };

  return {
    install: () => {
      processRef.exit = interceptedExit;
    },
    restore: () => {
      if (processRef.exit === interceptedExit) {
        processRef.exit = originalExit;
      }
    },
    exitRequested,
    getRequestedCode: () => requestedExitCode,
    realExit
  };
};

const awaitFrameworkExit = (promise: Promise<void>, timeoutMs?: number): Promise<void> => {
  if (timeoutMs === undefined) {
    return promise;
  }
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    timer.unref?.();
    void promise.then(finish, finish);
  });
};

/**
 * 注册进程级统一优雅关闭编排（供 `projects/app` 与 `pro/admin` 共用，位于宿主服务层）：
 *
 * - 信号处理期间持续保留监听器吸收重复 `SIGTERM`/`SIGINT`，避免 Node 恢复 OS 默认信号终止打断清理；
 * - 若宿主框架（如 Next.js standalone `start-server`）已先注册信号清理器，先让框架完整排空在途 HTTP 请求，
 *   待其触发退出后再并发关闭 Redis 与 Database Runtime，最后由唯一出口按原信号码（或失败码 `1`）退出。
 */
export const registerDalRuntimeShutdown = ({
  logger = silentShutdownLogger,
  processRef = process,
  signals = DEFAULT_SHUTDOWN_SIGNALS,
  exitProcess = true,
  closeResources = DEFAULT_DAL_CLOSE_RESOURCES,
  frameworkShutdownTimeoutMs
}: RegisterDalRuntimeShutdownOptions = {}) => {
  const context = getDalShutdownContext();
  const existing = context.registration;
  if (existing?.processRef === processRef && existing.closeResources === closeResources) {
    return existing.unregister;
  }
  existing?.unregister();

  let shutdownPromise: Promise<void> | undefined;
  let registered = true;
  const handlers = new Map<NodeJS.Signals, ProcessSignalListener>();
  const delegatedListeners = new Map<NodeJS.Signals, ProcessSignalListener[]>();

  const detachListeners = (restoreDelegated: boolean) => {
    if (!registered) return;
    registered = false;
    for (const [signal, handler] of handlers) {
      processRef.removeListener(signal, handler);
    }
    handlers.clear();

    if (restoreDelegated) {
      for (const [signal, priorListeners] of delegatedListeners) {
        for (const listener of priorListeners) {
          processRef.on(signal, listener);
        }
      }
    }
    delegatedListeners.clear();

    if (context.registration?.unregister === unregister) {
      context.registration = undefined;
    }
  };

  const unregister = () => {
    if (shutdownPromise !== undefined) return;
    detachListeners(true);
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    // 清理期间保持监听器挂载，重复 SIGTERM/SIGINT 直接忽略，防止 Node 回退 OS 默认终止打断关闭。
    if (shutdownPromise !== undefined) return;

    const selfHandler = handlers.get(signal);
    const priorListeners = delegatedListeners.get(signal) ?? [];
    const hasLateListeners = (processRef.listeners?.(signal) ?? []).some(
      (listener) => listener !== selfHandler
    );

    const exitGate = createDeferredExitGate(processRef);
    if (priorListeners.length > 0 || hasLateListeners) {
      exitGate.install();
    }

    const runShutdown = async (): Promise<void> => {
      try {
        if (priorListeners.length > 0) {
          for (const listener of priorListeners) {
            try {
              void Promise.resolve(listener(signal)).catch((error) => {
                logger.error('Host shutdown listener failed after process shutdown signal', {
                  signal,
                  error
                });
              });
            } catch (error) {
              logger.error('Host shutdown listener threw after process shutdown signal', {
                signal,
                error
              });
            }
          }
          await awaitFrameworkExit(exitGate.exitRequested, frameworkShutdownTimeoutMs);
        }

        const results = await Promise.allSettled(
          closeResources.map((closeFn) => Promise.resolve().then(() => closeFn()))
        );
        const failures = results.filter(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
        );

        detachListeners(false);
        exitGate.restore();

        if (failures.length === 0) {
          logger.info('DAL runtimes closed after process shutdown signal');
          if (exitProcess) exitGate.realExit(exitGate.getRequestedCode() ?? 0);
          return;
        }

        logger.error('DAL runtime close failed after process shutdown signal', {
          error: failures[0].reason,
          ...(failures.length > 1 ? { errors: failures.map((failure) => failure.reason) } : {})
        });
        if (exitProcess) exitGate.realExit(1);
      } finally {
        detachListeners(false);
        exitGate.restore();
      }
    };

    shutdownPromise = runShutdown().catch((error) => {
      detachListeners(false);
      exitGate.restore();
      try {
        logger.error('DAL runtime close failed after process shutdown signal', { error });
      } catch {
        // 退出兜底路径禁止二次抛出
      }
      if (exitProcess) {
        try {
          exitGate.realExit(1);
        } catch {
          // 忽略测试替身或退出回调抛错
        }
      }
    });
  };

  for (const signal of signals) {
    const priorListeners = [...(processRef.listeners?.(signal) ?? [])];
    if (priorListeners.length > 0) {
      for (const listener of priorListeners) {
        processRef.removeListener(signal, listener);
      }
      delegatedListeners.set(signal, priorListeners);
    }

    const handler: ProcessSignalListener = (receivedSignal) =>
      handleSignal(receivedSignal ?? signal);
    handlers.set(signal, handler);
    processRef.on(signal, handler);
  }

  const registration: DalShutdownRegistration = {
    processRef,
    closeResources,
    unregister
  };
  context.registration = registration;
  return unregister;
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

    const topology = normalizeOceanBaseTopologyUrls({
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
  const normalizedMainUrl = mainWriteUrl.trim();
  const rawLogWriteUrl =
    options !== undefined && 'logWriteUrl' in options
      ? options.logWriteUrl
      : (process.env.MONGODB_LOG_URI ?? serviceEnv.MONGODB_LOG_URI);
  const trimmedLogUrl = rawLogWriteUrl?.trim() ?? '';
  // Mongo 环境变量装配下，仅当日志库连接串非空且与主库不同时进入 separate 模式；与主库同串时按 shared 单池处理。
  const effectiveLogWriteUrl =
    trimmedLogUrl.length > 0 && trimmedLogUrl !== normalizedMainUrl ? trimmedLogUrl : undefined;

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
