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
type CloseResource = () => Promise<void> | void;
type ShutdownLogger = Pick<DbLogger, 'info' | 'error'>;

export type ProcessShutdownTarget = {
  on: (signal: NodeJS.Signals, listener: ProcessSignalListener) => unknown;
  removeListener: (signal: NodeJS.Signals, listener: ProcessSignalListener) => unknown;
  listeners: (signal: NodeJS.Signals) => ReadonlyArray<ProcessSignalListener>;
  exit: (code?: number) => void;
};

export type RegisterDalRuntimeShutdownOptions = {
  logger?: ShutdownLogger;
  processRef?: ProcessShutdownTarget;
  signals?: readonly NodeJS.Signals[];
  /** 仅用于单测替换默认关闭动作；默认并发关闭 Redis 与 Database Runtime。 */
  closeResources?: readonly CloseResource[];
};

type DalShutdownRegistration = {
  processRef: ProcessShutdownTarget;
  closeResources: readonly CloseResource[];
  unregister: () => void;
};

type DalShutdownContext = {
  registration?: DalShutdownRegistration;
};

const DAL_SHUTDOWN_CONTEXT_SYMBOL = Symbol.for('@fastgpt/service/dal-runtime-shutdown');
const DEFAULT_SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;
const DEFAULT_DAL_CLOSE_RESOURCES: readonly CloseResource[] = [closeRedisRuntime, closeDbRuntime];

const silentShutdownLogger: ShutdownLogger = {
  info: () => undefined,
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

/**
 * 临时接管 `process.exit`：只记录宿主框架请求的退出码而不立即退出，
 * 由统一出口在 DAL 资源释放完成后执行真正的退出。
 */
const interceptProcessExit = (processRef: ProcessShutdownTarget) => {
  const originalExit = processRef.exit;
  let requestedCode: number | undefined;
  let notifyRequested!: () => void;
  const requested = new Promise<void>((resolve) => {
    notifyRequested = resolve;
  });
  const interceptedExit = (code?: number) => {
    requestedCode ??= code;
    notifyRequested();
  };
  processRef.exit = interceptedExit;

  return {
    requested,
    requestedCode: () => requestedCode,
    restore: () => {
      if (processRef.exit === interceptedExit) {
        processRef.exit = originalExit;
      }
    }
  };
};

/**
 * 注册进程级统一优雅关闭编排（供 `projects/app` 与 `pro/admin` 共用，位于宿主服务层）：
 *
 * - 信号处理期间持续保留监听器吸收重复 `SIGTERM`/`SIGINT`，避免 Node 恢复 OS 默认信号终止打断清理；
 * - 若宿主框架（如 Next.js standalone `start-server`）已先注册信号清理器，先让框架完整排空在途 HTTP 请求，
 *   待其请求退出后再并发关闭 Redis 与 Database Runtime，最后由唯一出口按原信号码（或失败码 `1`）退出。
 */
export const registerDalRuntimeShutdown = ({
  logger = silentShutdownLogger,
  processRef = process,
  signals = DEFAULT_SHUTDOWN_SIGNALS,
  closeResources = DEFAULT_DAL_CLOSE_RESOURCES
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

    const hostListeners = delegatedListeners.get(signal) ?? [];
    const selfHandler = handlers.get(signal);
    const hasLateListeners = processRef
      .listeners(signal)
      .some((listener) => listener !== selfHandler);
    // 存在宿主监听器时接管 exit，防止其在 DAL 资源释放完成前抢先退出进程。
    const exitGate =
      hostListeners.length > 0 || hasLateListeners ? interceptProcessExit(processRef) : undefined;

    shutdownPromise = (async () => {
      let exitCode = 1;
      try {
        // 1. 先交由宿主框架停接并排空在途 HTTP 请求，以其请求退出作为排空完成信号。
        if (hostListeners.length > 0) {
          for (const listener of hostListeners) {
            void Promise.resolve()
              .then(() => listener(signal))
              .catch((error) => logger.error('Host shutdown listener failed', { signal, error }));
          }
          await exitGate?.requested;
        }

        // 2. 并发关闭同级资源，单个失败不阻断其余资源释放。
        const results = await Promise.allSettled(
          closeResources.map((close) => Promise.resolve().then(close))
        );
        const errors = results.flatMap((result) =>
          result.status === 'rejected' ? [result.reason] : []
        );
        if (errors.length > 0) {
          const error =
            errors.length === 1
              ? errors[0]
              : new AggregateError(errors, 'Multiple DAL runtimes failed to close');
          logger.error('DAL runtime close failed after process shutdown signal', { error });
        } else {
          logger.info('DAL runtimes closed after process shutdown signal');
          exitCode = exitGate?.requestedCode() ?? 0;
        }
      } catch (error) {
        logger.error('DAL runtime close failed after process shutdown signal', { error });
      } finally {
        // 3. 唯一退出出口：恢复原始 exit 后按宿主请求码（或失败码 1）退出。
        detachListeners(false);
        exitGate?.restore();
        processRef.exit(exitCode);
      }
    })();
  };

  for (const signal of signals) {
    const priorListeners = [...processRef.listeners(signal)];
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
