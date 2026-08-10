export type DatabaseErrorCode =
  | 'DB_INVALID_ARGUMENT'
  | 'DB_UNIQUE_CONSTRAINT'
  | 'DB_CONFLICT'
  | 'DB_TIMEOUT'
  | 'DB_UNAVAILABLE'
  | 'DB_OPERATION_FAILED';

export class DatabaseOperationError extends Error {
  readonly code: DatabaseErrorCode;
  override readonly cause?: unknown;

  constructor({
    message,
    code,
    cause
  }: {
    message: string;
    code: DatabaseErrorCode;
    cause?: unknown;
  }) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.cause = cause;
  }
}

export class DatabaseInvalidArgumentError extends DatabaseOperationError {
  constructor(cause?: unknown) {
    super({
      message: 'Invalid database operation argument',
      code: 'DB_INVALID_ARGUMENT',
      cause
    });
  }
}

export class DatabaseUniqueConstraintError extends DatabaseOperationError {
  readonly fields: readonly string[];

  constructor({ fields, cause }: { fields?: readonly string[]; cause?: unknown } = {}) {
    super({
      message: 'Database unique constraint violated',
      code: 'DB_UNIQUE_CONSTRAINT',
      cause
    });
    this.fields = fields ?? [];
  }
}

export class DatabaseConflictError extends DatabaseOperationError {
  constructor(cause?: unknown) {
    super({
      message: 'Database operation conflict',
      code: 'DB_CONFLICT',
      cause
    });
  }
}

export class DatabaseTimeoutError extends DatabaseOperationError {
  constructor(cause?: unknown) {
    super({
      message: 'Database operation timed out',
      code: 'DB_TIMEOUT',
      cause
    });
  }
}

export class DatabaseUnavailableError extends DatabaseOperationError {
  constructor(cause?: unknown) {
    super({
      message: 'Database is unavailable',
      code: 'DB_UNAVAILABLE',
      cause
    });
  }
}

export class DatabaseExecutionError extends DatabaseOperationError {
  constructor(cause?: unknown) {
    super({
      message: 'Database operation failed',
      code: 'DB_OPERATION_FAILED',
      cause
    });
  }
}

export const isDatabaseOperationError = (error: unknown): error is DatabaseOperationError =>
  error instanceof DatabaseOperationError;
