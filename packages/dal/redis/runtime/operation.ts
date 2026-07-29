import {
  isRedisOperationError,
  RedisInvalidArgumentError,
  RedisOperationExecutionError,
  RedisOperationTimeoutError,
  type RedisOperationOutcome
} from './errors';

/** Redis command 的执行语义；operation 名称本身只用于错误和观测标签。 */
export type RedisOperationMode = 'read' | 'idempotent-write' | 'uncertain-write';

type RedisOperationPolicy = {
  maxAttempts: 1 | 2;
  timeoutOutcome: Exclude<RedisOperationOutcome, 'not-started'>;
};

const DEFAULT_OPERATION_TIMEOUT_MS = 3_000;

const operationPolicies: Record<RedisOperationMode, RedisOperationPolicy> = {
  read: {
    maxAttempts: 2,
    timeoutOutcome: 'failed'
  },
  'idempotent-write': {
    maxAttempts: 2,
    timeoutOutcome: 'unknown'
  },
  'uncertain-write': {
    maxAttempts: 1,
    timeoutOutcome: 'unknown'
  }
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

export type RedisOperationInput<T> = {
  operation: string;
  execute: () => Promise<T>;
  timeoutMs?: number;
};

/**
 * 集中执行 Redis operation，并按写入是否可能重复应用选择 retry 语义。
 *
 * operation 只作为错误和观测标签，不再需要维护全量 operation allowlist。调用方只能选择
 * read、幂等写入或结果未知写入三种固定语义，不能自行声明 retry 次数。timeout 仅终止等待，
 * 不能取消已经发往 Redis 的命令，因此写操作超时会标记 outcome=unknown。
 */
export class RedisOperationExecutor {
  constructor(private readonly defaultTimeoutMs = DEFAULT_OPERATION_TIMEOUT_MS) {}

  readonly read = <T>(input: RedisOperationInput<T>): Promise<T> =>
    this.execute({ ...input, mode: 'read' });

  readonly idempotentWrite = <T>(input: RedisOperationInput<T>): Promise<T> =>
    this.execute({ ...input, mode: 'idempotent-write' });

  readonly uncertainWrite = <T>(input: RedisOperationInput<T>): Promise<T> =>
    this.execute({ ...input, mode: 'uncertain-write' });

  /** 按调用方选择的执行模式运行 operation，并统一处理 timeout、retry 和错误结果。 */
  private async execute<T>({
    operation,
    mode,
    execute,
    timeoutMs
  }: RedisOperationInput<T> & { mode: RedisOperationMode }): Promise<T> {
    const policy = operationPolicies[mode];
    const effectiveTimeoutMs = timeoutMs ?? this.defaultTimeoutMs;
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
  }
}

const defaultRedisOperationExecutor = new RedisOperationExecutor();

export const executeRedisRead = <T>(input: RedisOperationInput<T>) =>
  defaultRedisOperationExecutor.read(input);

export const executeRedisIdempotentWrite = <T>(input: RedisOperationInput<T>) =>
  defaultRedisOperationExecutor.idempotentWrite(input);

export const executeRedisUncertainWrite = <T>(input: RedisOperationInput<T>) =>
  defaultRedisOperationExecutor.uncertainWrite(input);
