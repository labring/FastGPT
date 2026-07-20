export type SerializedSagaError = {
  name: string;
  message: string;
  code?: string;
  details?: unknown;
};

export class DurableSagaError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, options: { code: string; details?: unknown; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = 'DurableSagaError';
    this.code = options.code;
    this.details = options.details;
  }
}

export class SagaConflictError extends DurableSagaError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'SAGA_CONFLICT', details });
    this.name = 'SagaConflictError';
  }
}

export class SagaDefinitionError extends DurableSagaError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'SAGA_DEFINITION_INVALID', details });
    this.name = 'SagaDefinitionError';
  }
}

export class SagaNotFoundError extends DurableSagaError {
  constructor(sagaId: string) {
    super(`Saga "${sagaId}" was not found`, { code: 'SAGA_NOT_FOUND', details: { sagaId } });
    this.name = 'SagaNotFoundError';
  }
}

export class SagaExecutionLostError extends DurableSagaError {
  constructor(sagaId: string) {
    super(`Execution ownership for saga "${sagaId}" was lost`, {
      code: 'SAGA_EXECUTION_LOST',
      details: { sagaId }
    });
    this.name = 'SagaExecutionLostError';
  }
}

export class SagaNonRetryableError extends DurableSagaError {
  constructor(message: string, options?: { code?: string; details?: unknown; cause?: unknown }) {
    super(message, {
      code: options?.code ?? 'SAGA_NON_RETRYABLE',
      details: options?.details,
      cause: options?.cause
    });
    this.name = 'SagaNonRetryableError';
  }
}

export class SagaBlockedError extends DurableSagaError {
  constructor(message: string, options?: { code?: string; details?: unknown; cause?: unknown }) {
    super(message, {
      code: options?.code ?? 'SAGA_BLOCKED',
      details: options?.details,
      cause: options?.cause
    });
    this.name = 'SagaBlockedError';
  }
}

const MAX_ERROR_STRING_LENGTH = 4_096;
const MAX_ERROR_DETAILS_DEPTH = 5;
const MAX_ERROR_COLLECTION_SIZE = 50;
const sensitiveDetailKey = /authorization|cookie|password|secret|token|api[-_]?key/i;

const truncate = (value: string) =>
  value.length <= MAX_ERROR_STRING_LENGTH
    ? value
    : `${value.slice(0, MAX_ERROR_STRING_LENGTH)}...[truncated]`;

/** Produces a bounded, acyclic diagnostic value and redacts common credential fields. */
const sanitizeErrorDetails = (
  value: unknown,
  depth = 0,
  ancestors = new Set<object>()
): unknown => {
  if (value === undefined) return undefined;
  if (depth > MAX_ERROR_DETAILS_DEPTH) return '[max-depth]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return '[circular]';
    ancestors.add(value);
    const result = value
      .slice(0, MAX_ERROR_COLLECTION_SIZE)
      .map((item) => sanitizeErrorDetails(item, depth + 1, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (typeof value === 'object') {
    if (ancestors.has(value)) return '[circular]';
    ancestors.add(value);
    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_ERROR_COLLECTION_SIZE)
      .map(([key, item]) => [
        key,
        sensitiveDetailKey.test(key)
          ? '[redacted]'
          : sanitizeErrorDetails(item, depth + 1, ancestors)
      ]);
    ancestors.delete(value);
    return Object.fromEntries(entries);
  }
  return String(value);
};

/** Converts an unknown Activity failure into a persistable, transport-neutral value. */
export const serializeSagaError = (error: unknown): SerializedSagaError => {
  if (error instanceof DurableSagaError) {
    return {
      name: error.name,
      message: truncate(error.message),
      code: error.code,
      details: sanitizeErrorDetails(error.details)
    };
  }

  if (error instanceof Error) {
    return { name: error.name, message: truncate(error.message) };
  }

  return { name: 'UnknownError', message: truncate(String(error)) };
};
