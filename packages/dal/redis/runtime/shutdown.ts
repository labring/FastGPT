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

type RedisShutdownRegistration = {
  runtime: RedisRuntime;
  processRef: RedisProcessLike;
  unregister: () => void;
};

type RedisShutdownContext = {
  registration?: RedisShutdownRegistration;
};

export type RedisRuntimeShutdownOptions = {
  runtime?: RedisRuntime;
  logger?: RedisRuntimeLogger;
  processRef?: RedisProcessLike;
  signals?: readonly NodeJS.Signals[];
  exitProcess?: boolean;
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
  exitProcess = true
}: RedisRuntimeShutdownOptions = {}) => {
  if (!runtime) {
    throw new Error('Redis runtime has not been configured');
  }

  const context = getRedisShutdownContext();
  const existing = context.registration;
  if (existing?.runtime === runtime && existing.processRef === processRef) {
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
    // 通过 Promise 链统一接住 Runtime.close 的同步异常和异步拒绝，避免信号 listener
    // 把异常抛回 Node 的 EventEmitter 调用栈。
    closePromise = Promise.resolve().then(() => runtime.close());
    void closePromise.then(
      () => {
        logger.info('Redis runtime closed after process shutdown signal');
        if (exitProcess) processRef.exit(0);
      },
      (error) => {
        logger.error('Redis runtime close failed after process shutdown signal', { error });
        if (exitProcess) processRef.exit(1);
      }
    );
  };

  for (const signal of signals) {
    const handler = () => handleSignal();
    handlers.set(signal, handler);
    processRef.on(signal, handler);
  }

  const registration = { runtime, processRef, unregister } satisfies RedisShutdownRegistration;
  context.registration = registration;
  return unregister;
};
