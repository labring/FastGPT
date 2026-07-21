export type RedisCapabilityRole = 'command' | 'blocking';

export type RedisCapabilityErrorCode =
  | 'REDIS_INVALID_ARGUMENT'
  | 'REDIS_INVALID_RESPONSE'
  | 'REDIS_OPERATION_FAILED'
  | 'REDIS_OPERATION_TIMEOUT';

export type RedisOperationOutcome = 'not-started' | 'failed' | 'unknown';

/** Redis capability 对外暴露的稳定错误基类，不包含完整 key 或业务数据。 */
export class RedisCapabilityError extends Error {
  readonly code: RedisCapabilityErrorCode;
  readonly operation: string;
  readonly role: RedisCapabilityRole;
  readonly outcome: RedisOperationOutcome;
  override readonly cause?: unknown;

  constructor({
    name,
    message,
    code,
    operation,
    role,
    outcome,
    cause
  }: {
    name: string;
    message: string;
    code: RedisCapabilityErrorCode;
    operation: string;
    role: RedisCapabilityRole;
    outcome: RedisOperationOutcome;
    cause?: unknown;
  }) {
    super(message);
    this.name = name;
    this.code = code;
    this.operation = operation;
    this.role = role;
    this.outcome = outcome;
    this.cause = cause;
  }
}

export class RedisInvalidArgumentError extends RedisCapabilityError {
  constructor({ operation, message }: { operation: string; message: string }) {
    super({
      name: 'RedisInvalidArgumentError',
      message,
      code: 'REDIS_INVALID_ARGUMENT',
      operation,
      role: 'command',
      outcome: 'not-started'
    });
  }
}

export class RedisInvalidResponseError extends RedisCapabilityError {
  constructor({
    operation,
    message,
    role = 'command'
  }: {
    operation: string;
    message: string;
    role?: RedisCapabilityRole;
  }) {
    super({
      name: 'RedisInvalidResponseError',
      message,
      code: 'REDIS_INVALID_RESPONSE',
      operation,
      role,
      outcome: 'failed'
    });
  }
}

export class RedisOperationExecutionError extends RedisCapabilityError {
  readonly attempt: number;

  constructor({
    operation,
    role,
    attempt,
    outcome,
    cause
  }: {
    operation: string;
    role: RedisCapabilityRole;
    attempt: number;
    outcome: Exclude<RedisOperationOutcome, 'not-started'>;
    cause: unknown;
  }) {
    super({
      name: 'RedisOperationExecutionError',
      message: `Redis operation ${operation} failed`,
      code: 'REDIS_OPERATION_FAILED',
      operation,
      role,
      outcome,
      cause
    });
    this.attempt = attempt;
  }
}

export class RedisOperationTimeoutError extends RedisCapabilityError {
  readonly timeoutMs: number;
  readonly attempt: number;

  constructor({
    operation,
    role,
    timeoutMs,
    attempt,
    outcome
  }: {
    operation: string;
    role: RedisCapabilityRole;
    timeoutMs: number;
    attempt: number;
    outcome: Exclude<RedisOperationOutcome, 'not-started'>;
  }) {
    super({
      name: 'RedisOperationTimeoutError',
      message: `Redis operation ${operation} timed out`,
      code: 'REDIS_OPERATION_TIMEOUT',
      operation,
      role,
      outcome
    });
    this.timeoutMs = timeoutMs;
    this.attempt = attempt;
  }
}

export const isRedisCapabilityError = (error: unknown): error is RedisCapabilityError => {
  return error instanceof RedisCapabilityError;
};
