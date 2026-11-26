import { getConfiguredRedisRuntime, type RedisRuntime } from './connection';
import type { RedisRuntimeLogger } from '../types';

const REDIS_SHUTDOWN_CONTEXT_SYMBOL = Symbol.for('@fastgpt/dal/redis/shutdown-context');
const DEFAULT_SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;
const DEFAULT_FRAMEWORK_SHUTDOWN_TIMEOUT_MS = 10_000;

const silentLogger: RedisRuntimeLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

type SignalListener = (...args: any[]) => unknown;

type RedisProcessLike = {
  on: (signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void) => unknown;
  removeListener: (signal: NodeJS.Signals, listener: SignalListener) => unknown;
  listeners?: (signal: NodeJS.Signals) => ReadonlyArray<SignalListener>;
  exit: (code?: number) => void;
};

type ClosableRedisRuntime = Pick<RedisRuntime, 'close'>;

type RedisShutdownRegistration = {
  runtime: ClosableRedisRuntime;
  processRef: RedisProcessLike;
  onShutdown?: () => Promise<void> | void;
  unregister: () => void;
};

type RedisShutdownContext = {
  registration?: RedisShutdownRegistration;
};

export type RedisRuntimeShutdownOptions = {
  runtime?: ClosableRedisRuntime;
  logger?: RedisRuntimeLogger;
  processRef?: RedisProcessLike;
  signals?: readonly NodeJS.Signals[];
  exitProcess?: boolean;
  /** 可选协同关闭回调（如 `closeDbRuntime()`），在同一次退出信号中与 Redis 并发关闭后再统一决定退出码。 */
  onShutdown?: () => Promise<void> | void;
  /** 存在已有框架信号监听器（如 Next.js standalone cleanup）时等待其排空并触发退出的最长时长（毫秒）。 */
  frameworkShutdownTimeoutMs?: number;
};

const getRedisShutdownContext = (): RedisShutdownContext => {
  const existing = Reflect.get(globalThis, REDIS_SHUTDOWN_CONTEXT_SYMBOL) as
    | RedisShutdownContext
    | undefined;
  if (existing) return existing;

  const context: RedisShutdownContext = {};
  Reflect.set(globalThis, REDIS_SHUTDOWN_CONTEXT_SYMBOL, context);
  return context;
};

const waitForSignalWithTimeout = (promise: Promise<void>, timeoutMs: number): Promise<void> =>
  new Promise<void>((resolve) => {
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

/**
 * 注册进程级 Redis（及可选协同资源如 `DbRuntime`）优雅关闭处理器。
 *
 * 该函数只在应用 instrumentation 显式调用时安装 SIGTERM/SIGINT listener；library import
 * 不产生进程副作用。若进程上已存在框架级退出监听器（如 Next.js standalone 的 `cleanup`），
 * 会将其托管到同一退出编排中：先等待框架排空 HTTP 请求，再等待 Redis 与协同 DAL 资源关闭，
 * 最后由唯一出口决定进程退出码，避免框架与 DAL 两个监听器争先 `process.exit`。
 */
export const registerRedisRuntimeShutdown = ({
  runtime = getConfiguredRedisRuntime(),
  logger = silentLogger,
  processRef = process,
  signals = DEFAULT_SHUTDOWN_SIGNALS,
  exitProcess = true,
  onShutdown,
  frameworkShutdownTimeoutMs = DEFAULT_FRAMEWORK_SHUTDOWN_TIMEOUT_MS
}: RedisRuntimeShutdownOptions = {}) => {
  if (!runtime) {
    throw new Error('Redis runtime has not been configured');
  }

  const context = getRedisShutdownContext();
  const existing = context.registration;
  if (
    existing?.runtime === runtime &&
    existing.processRef === processRef &&
    existing.onShutdown === onShutdown
  ) {
    return existing.unregister;
  }
  existing?.unregister();

  let closePromise: Promise<void> | undefined;
  let registered = true;
  const handlers = new Map<NodeJS.Signals, (signal: NodeJS.Signals) => void>();
  const delegatedListeners = new Map<NodeJS.Signals, SignalListener[]>();

  const detachSelf = (restoreDelegated: boolean) => {
    if (!registered) return;
    registered = false;
    for (const [signal, handler] of handlers) {
      processRef.removeListener(signal, handler);
    }
    handlers.clear();

    if (restoreDelegated) {
      for (const [signal, priorListeners] of delegatedListeners) {
        for (const listener of priorListeners) {
          processRef.on(signal, listener as (signal: NodeJS.Signals) => void);
        }
      }
    }
    delegatedListeners.clear();

    if (context.registration?.unregister === unregister) {
      context.registration = undefined;
    }
  };

  const unregister = () => detachSelf(true);

  const handleSignal = (signal: NodeJS.Signals) => {
    if (closePromise) return;
    const selfHandler = handlers.get(signal);
    const priorListeners = delegatedListeners.get(signal) ?? [];
    const lateListeners = (processRef.listeners?.(signal) ?? []).filter(
      (listener) => listener !== selfHandler
    );
    const hasCoordinatedListeners = priorListeners.length > 0 || lateListeners.length > 0;

    detachSelf(false);

    const originalExit = processRef.exit;
    const realExit = originalExit.bind(processRef);
    let requestedExitCode: number | undefined;
    let frameworkExitResolved = false;
    let resolveFrameworkExit!: () => void;
    const frameworkExitPromise = new Promise<void>((resolve) => {
      resolveFrameworkExit = resolve;
    });

    const interceptedExit = (code?: number) => {
      if (!frameworkExitResolved) {
        frameworkExitResolved = true;
        requestedExitCode = code;
        resolveFrameworkExit();
      }
    };

    const restoreExit = () => {
      if (processRef.exit === interceptedExit) {
        processRef.exit = originalExit;
      }
    };

    if (hasCoordinatedListeners) {
      // 仅在存在框架/其他信号监听器时接管本次退出信号中的 process.exit，
      // 确保框架排空 HTTP 请求后再释放 Redis/DB 连接池，最后由唯一出口退出进程。
      processRef.exit = interceptedExit;
    }

    const runShutdown = async (): Promise<void> => {
      try {
        if (hasCoordinatedListeners) {
          for (const listener of priorListeners) {
            try {
              void Promise.resolve(listener(signal)).catch((error) => {
                logger.error('Prior shutdown listener failed after process shutdown signal', {
                  signal,
                  error
                });
              });
            } catch (error) {
              logger.error('Prior shutdown listener threw after process shutdown signal', {
                signal,
                error
              });
            }
          }

          await waitForSignalWithTimeout(frameworkExitPromise, frameworkShutdownTimeoutMs);
        }

        const tasks: Array<Promise<void>> = [Promise.resolve().then(() => runtime.close())];
        if (onShutdown !== undefined) {
          tasks.push(Promise.resolve().then(() => onShutdown()));
        }

        const results = await Promise.allSettled(tasks);
        const failures = results.filter(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
        );

        restoreExit();

        if (failures.length === 0) {
          logger.info('Redis runtime closed after process shutdown signal');
          if (exitProcess) realExit(requestedExitCode ?? 0);
          return;
        }

        logger.error('Redis runtime close failed after process shutdown signal', {
          error: failures[0].reason,
          ...(failures.length > 1 ? { errors: failures.map((failure) => failure.reason) } : {})
        });
        if (exitProcess) realExit(1);
      } finally {
        restoreExit();
      }
    };

    // 显式捕获收尾阶段（如 logger 或 exit 自身异常），彻底消除未处理 rejection。
    closePromise = runShutdown().catch((error) => {
      restoreExit();
      try {
        logger.error('Redis runtime close failed after process shutdown signal', { error });
      } catch {
        // 退出兜底路径禁止二次抛出
      }
      if (exitProcess) {
        try {
          realExit(1);
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

    const handler = (receivedSignal?: NodeJS.Signals) => handleSignal(receivedSignal ?? signal);
    handlers.set(signal, handler);
    processRef.on(signal, handler);
  }

  const registration = {
    runtime,
    processRef,
    onShutdown,
    unregister
  } satisfies RedisShutdownRegistration;
  context.registration = registration;
  return unregister;
};
