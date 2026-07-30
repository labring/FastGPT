import type { RedisRuntimeLogger } from '../types';

export const DEFAULT_CLOSE_TIMEOUT_MS = 5_000;
export const DEFAULT_RESTART_DELAY_MS = 1_000;
export const DEFAULT_BULLMQ_RESOURCE_ID = 'redis:default';
export const BULLMQ_RUNTIME_CONTEXT_SYMBOL = Symbol.for('@fastgpt/dal/redis/bullmq-context');

export const silentBullMQLogger: RedisRuntimeLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

export const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
