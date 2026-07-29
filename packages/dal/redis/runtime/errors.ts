export type RedisOperationRole = 'command';

export type RedisOperationErrorCode =
  | 'REDIS_INVALID_ARGUMENT'
  | 'REDIS_INVALID_RESPONSE'
  | 'REDIS_OPERATION_FAILED'
  | 'REDIS_OPERATION_TIMEOUT';

export type RedisOperationOutcome = 'not-started' | 'failed' | 'unknown';

/** Redis adapter 对外暴露的稳定 operation 错误基类，不包含完整 key 或业务数据。 */
export class RedisOperationError extends Error {
  readonly code: RedisOperationErrorCode;
  readonly operation: string;
  readonly role: RedisOperationRole;
  readonly outcome: RedisOperationOutcome;
  override readonly cause?: unknown;

  constructor({
    // name,
    message,
    code,
    operation,
    role,
    outcome,
    cause
  }: {
    message: string;
    code: RedisOperationErrorCode;
    operation: string;
    role: RedisOperationRole;
    outcome: RedisOperationOutcome;
    cause?: unknown;
  }) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.operation = operation;
    this.role = role;
    this.outcome = outcome;
    this.cause = cause;
  }
}

export class RedisInvalidArgumentError extends RedisOperationError {
  constructor({ operation, message }: { operation: string; message: string }) {
    super({
      message,
      code: 'REDIS_INVALID_ARGUMENT',
      operation,
      role: 'command',
      outcome: 'not-started'
    });
  }
}

export class RedisInvalidResponseError extends RedisOperationError {
  constructor({ operation, message }: { operation: string; message: string }) {
    super({
      message,
      code: 'REDIS_INVALID_RESPONSE',
      operation,
      role: 'command',
      outcome: 'failed'
    });
  }
}

export class RedisOperationExecutionError extends RedisOperationError {
  readonly attempt: number;

  constructor({
    operation,
    attempt,
    outcome,
    cause
  }: {
    operation: string;
    attempt: number;
    outcome: Exclude<RedisOperationOutcome, 'not-started'>;
    cause: unknown;
  }) {
    super({
      message: `Redis operation ${operation} failed`,
      code: 'REDIS_OPERATION_FAILED',
      operation,
      role: 'command',
      outcome,
      cause
    });
    this.attempt = attempt;
  }
}

export class RedisOperationTimeoutError extends RedisOperationError {
  readonly timeoutMs: number;
  readonly attempt: number;

  constructor({
    operation,
    timeoutMs,
    attempt,
    outcome
  }: {
    operation: string;
    timeoutMs: number;
    attempt: number;
    outcome: Exclude<RedisOperationOutcome, 'not-started'>;
  }) {
    super({
      message: `Redis operation ${operation} timed out`,
      code: 'REDIS_OPERATION_TIMEOUT',
      operation,
      role: 'command',
      outcome
    });
    this.timeoutMs = timeoutMs;
    this.attempt = attempt;
  }
}

export const isRedisOperationError = (error: unknown): error is RedisOperationError => {
  return error instanceof RedisOperationError;
};
