import { getConfiguredRedisRuntime, type RedisRuntime } from './connection';
import type { RedisRuntimeLogger } from '../types';

const REDIS_SHUTDOWN_CONTEXT_SYMBOL = Symbol.for('@fastgpt/dal/redis/shutdown-context');
const DEFAULT_SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

const silentLogger: RedisRuntimeLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

type RedisProcessLike = {
  on: (signal: NodeJS.Signals, listener: () => void) => unknown;
  removeListener: (signal: NodeJS.Signals, listener: () => void) => unknown;
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

/**
 * 注册进程级 Redis 优雅关闭处理器。
 *
 * 该函数只在应用 instrumentation 显式调用时安装 SIGTERM/SIGINT listener；library import
 * 不产生进程副作用。重复注册同一 Runtime 是幂等的，信号触发后只执行一次 close。
 */
export const registerRedisRuntimeShutdown = ({
  runtime = getConfiguredRedisRuntime(),
  logger = silentLogger,
  processRef = process,
  signals = DEFAULT_SHUTDOWN_SIGNALS,
  exitProcess = true,
  onShutdown
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
  const handlers = new Map<NodeJS.Signals, () => void>();

  const unregister = () => {
    if (!registered) return;
    registered = false;
    for (const [signal, handler] of handlers) {
      processRef.removeListener(signal, handler);
    }
    handlers.clear();
    if (context.registration?.unregister === unregister) {
      context.registration = undefined;
    }
  };

  const handleSignal = () => {
    if (closePromise) return;
    unregister();
    // 通过 allSettled 统一等待 Redis 与协同资源（如 DbRuntime）完成关闭后再决定退出码，
    // 避免单边异常中断另一侧资源释放，或把异常抛回 Node 的 EventEmitter 调用栈。
    const tasks: Array<Promise<void>> = [Promise.resolve().then(() => runtime.close())];
    if (onShutdown !== undefined) {
      tasks.push(Promise.resolve().then(() => onShutdown()));
    }

    closePromise = Promise.allSettled(tasks).then((results) => {
      const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );
      if (failures.length === 0) {
        logger.info('Redis runtime closed after process shutdown signal');
        if (exitProcess) processRef.exit(0);
        return;
      }

      logger.error('Redis runtime close failed after process shutdown signal', {
        error: failures[0].reason,
        ...(failures.length > 1 ? { errors: failures.map((failure) => failure.reason) } : {})
      });
      if (exitProcess) processRef.exit(1);
    });
    void closePromise;
  };

  for (const signal of signals) {
    const handler = () => handleSignal();
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
