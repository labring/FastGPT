import {
  isRedisCapabilityError,
  RedisInvalidArgumentError,
  RedisOperationExecutionError,
  RedisOperationTimeoutError,
  type RedisCapabilityRole,
  type RedisOperationOutcome
} from './errors';

export type RedisOperation =
  | 'counter.increment'
  | 'counter.incrementFloat'
  | 'hash.delete'
  | 'hash.getAll'
  | 'hash.setFields'
  | 'lease.release'
  | 'lease.renew'
  | 'scan.iterate'
  | 'scan.unlink'
  | 'stream.append'
  | 'stream.expire'
  | 'stream.readBlocking'
  | 'stream.readRange'
  | 'stream.trim'
  | 'string.append'
  | 'string.delete'
  | 'string.get'
  | 'string.set'
  | 'string.setIfAbsent'
  | 'string.ttl'
  | 'version.initialize';

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
  'counter.increment': singleAttemptWritePolicy,
  'counter.incrementFloat': singleAttemptWritePolicy,
  'hash.delete': singleAttemptWritePolicy,
  'hash.getAll': readPolicy,
  'hash.setFields': retryablePolicy,
  'lease.release': singleAttemptWritePolicy,
  'lease.renew': retryablePolicy,
  'scan.iterate': readPolicy,
  'scan.unlink': singleAttemptWritePolicy,
  'stream.append': singleAttemptWritePolicy,
  'stream.expire': retryablePolicy,
  'stream.readBlocking': {
    maxAttempts: 1,
    timeoutMs: DEFAULT_OPERATION_TIMEOUT_MS,
    timeoutOutcome: 'failed'
  },
  'stream.readRange': readPolicy,
  'stream.trim': singleAttemptWritePolicy,
  'string.append': singleAttemptWritePolicy,
  'string.delete': singleAttemptWritePolicy,
  'string.get': readPolicy,
  'string.set': retryablePolicy,
  'string.setIfAbsent': singleAttemptWritePolicy,
  'string.ttl': readPolicy,
  'version.initialize': retryablePolicy
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
  const message = error instanceof Error ? error.message : String(error ?? '');
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
  role = 'command',
  execute,
  timeoutMs
}: {
  operation: RedisOperation;
  role?: RedisCapabilityRole;
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

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      return await executeAttempt({ execute, timeoutMs: effectiveTimeoutMs });
    } catch (error) {
      if (isRedisCapabilityError(error)) throw error;

      const canRetry = attempt < policy.maxAttempts && isTransientRedisError(error);
      if (canRetry) continue;

      if (error instanceof RedisAttemptTimeoutError) {
        throw new RedisOperationTimeoutError({
          operation,
          role,
          timeoutMs: effectiveTimeoutMs,
          attempt,
          outcome: policy.timeoutOutcome
        });
      }

      throw new RedisOperationExecutionError({
        operation,
        role,
        attempt,
        outcome: policy.timeoutOutcome,
        cause: error
      });
    }
  }

  throw new RedisOperationExecutionError({
    operation,
    role,
    attempt: policy.maxAttempts,
    outcome: policy.timeoutOutcome,
    cause: new Error('Redis operation exhausted without a result')
  });
};
