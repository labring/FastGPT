import {
  isRedisOperationError,
  RedisInvalidArgumentError,
  RedisOperationExecutionError,
  RedisOperationTimeoutError,
  type RedisOperationOutcome
} from './errors';

export type RedisOperation =
  | 'scan.iterate'
  | 'string.delete'
  | 'string.deleteMany'
  | 'string.get'
  | 'string.getOrSet'
  | 'string.getPair'
  | 'string.set'
  | 'string.setPair'
  | 'string.setIfAbsent'
  | 'lease.acquire'
  | 'lease.renew'
  | 'lease.release'
  | 'hash.getAll'
  | 'hash.setWithTtl'
  | 'fixedWindow.consume'
  | 'number.incrementWithTtl';

type RedisOperationPolicy = {
  maxAttempts: 1 | 2;
  timeoutMs: number;
  timeoutOutcome: Exclude<RedisOperationOutcome, 'not-started'>;
};

const DEFAULT_OPERATION_TIMEOUT_MS = 3_000;

const retryablePolicy: RedisOperationPolicy = {
  maxAttempts: 2,
  timeoutMs: DEFAULT_OPERATION_TIMEOUT_MS,
  timeoutOutcome: 'unknown'
};
const readPolicy: RedisOperationPolicy = {
  maxAttempts: 2,
  timeoutMs: DEFAULT_OPERATION_TIMEOUT_MS,
  timeoutOutcome: 'failed'
};
const singleAttemptWritePolicy: RedisOperationPolicy = {
  maxAttempts: 1,
  timeoutMs: DEFAULT_OPERATION_TIMEOUT_MS,
  timeoutOutcome: 'unknown'
};

const operationPolicies: Record<RedisOperation, RedisOperationPolicy> = {
  'scan.iterate': readPolicy,
  'string.delete': singleAttemptWritePolicy,
  'string.deleteMany': retryablePolicy,
  'string.get': readPolicy,
  'string.getOrSet': singleAttemptWritePolicy,
  'string.getPair': readPolicy,
  'string.set': retryablePolicy,
  'string.setPair': singleAttemptWritePolicy,
  'string.setIfAbsent': singleAttemptWritePolicy,
  'lease.acquire': singleAttemptWritePolicy,
  'lease.renew': singleAttemptWritePolicy,
  'lease.release': singleAttemptWritePolicy,
  'hash.getAll': readPolicy,
  'hash.setWithTtl': singleAttemptWritePolicy,
  'fixedWindow.consume': singleAttemptWritePolicy,
  'number.incrementWithTtl': singleAttemptWritePolicy
};

const transientErrorMessages = [
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'READONLY',
  'Connection is closed',
  'Reached the max retries per request limit'
];

class RedisAttemptTimeoutError extends Error {}

const isTransientRedisError = (error: unknown) => {
  if (error instanceof RedisAttemptTimeoutError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return transientErrorMessages.some((item) => message.includes(item));
};

const executeAttempt = <T>({
  execute,
  timeoutMs
}: {
  execute: () => Promise<T>;
  timeoutMs: number;
}) =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new RedisAttemptTimeoutError()), timeoutMs);
    Promise.resolve()
      .then(execute)
      .then(resolve, reject)
      .finally(() => clearTimeout(timeout));
  });

/**
 * 按固定 allowlist 执行 Redis operation。
 *
 * 调用方不能自行声明可重试；只有 operation policy 中明确为幂等的操作会在瞬时故障时重试一次。
 * timeout 仅终止等待，不能取消已经发往 Redis 的命令，因此写操作超时会标记 outcome=unknown。
 */
export const executeRedisOperation = async <T>({
  operation,
  execute,
  timeoutMs
}: {
  operation: RedisOperation;
  execute: () => Promise<T>;
  timeoutMs?: number;
}): Promise<T> => {
  const policy = operationPolicies[operation];
  const effectiveTimeoutMs = timeoutMs ?? policy.timeoutMs;
  if (!Number.isSafeInteger(effectiveTimeoutMs) || effectiveTimeoutMs <= 0) {
    throw new RedisInvalidArgumentError({
      operation,
      message: 'timeoutMs must be a positive safe integer'
    });
  }

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await executeAttempt({ execute, timeoutMs: effectiveTimeoutMs });
    } catch (error) {
      if (isRedisOperationError(error)) throw error;

      const canRetry = attempt < policy.maxAttempts && isTransientRedisError(error);
      if (canRetry) continue;

      if (error instanceof RedisAttemptTimeoutError) {
        throw new RedisOperationTimeoutError({
          operation,
          timeoutMs: effectiveTimeoutMs,
          attempt,
          outcome: policy.timeoutOutcome
        });
      }

      throw new RedisOperationExecutionError({
        operation,
        attempt,
        outcome: policy.timeoutOutcome,
        cause: error
      });
    }
  }
};
