import {
  DatabaseConflictError,
  DatabaseExecutionError,
  DatabaseInvalidArgumentError,
  DatabaseTimeoutError,
  DatabaseUnavailableError,
  DatabaseUniqueConstraintError,
  isDatabaseOperationError,
  type DatabaseErrorAdapter
} from '../db';

export class MongoInvalidArgumentError extends Error {}

type ErrorRecord = {
  name?: unknown;
  code?: unknown;
  codeName?: unknown;
  keyPattern?: unknown;
  hasErrorLabel?: unknown;
};

const toErrorRecord = (error: unknown): ErrorRecord =>
  error !== null && typeof error === 'object' ? error : {};

const hasErrorLabel = (error: ErrorRecord, label: string) =>
  typeof error.hasErrorLabel === 'function' && error.hasErrorLabel(label) === true;

const getUniqueFields = (error: ErrorRecord) => {
  if (!error.keyPattern || typeof error.keyPattern !== 'object') return [];
  return Object.keys(error.keyPattern).sort();
};

const conflictCodes = new Set([112, 244, 251]);
const timeoutCodes = new Set([50, 262]);
const unavailableCodes = new Set([6, 7, 89, 91, 189, 9001, 11600, 11602]);
const timeoutNames = new Set(['MongoNetworkTimeoutError', 'MongoOperationTimeoutError']);
const unavailableNames = new Set(['MongoNetworkError', 'MongoServerSelectionError']);

export class MongoErrorAdapter implements DatabaseErrorAdapter {
  adapt(error: unknown) {
    if (isDatabaseOperationError(error)) return error;
    if (error instanceof MongoInvalidArgumentError) {
      return new DatabaseInvalidArgumentError(error);
    }

    const record = toErrorRecord(error);
    if (record.code === 11000 || record.code === 11001) {
      return new DatabaseUniqueConstraintError({
        fields: getUniqueFields(record),
        cause: error
      });
    }
    if (record.name === 'ValidationError' || record.name === 'CastError') {
      return new DatabaseInvalidArgumentError(error);
    }
    if (
      conflictCodes.has(record.code as number) ||
      record.codeName === 'WriteConflict' ||
      hasErrorLabel(record, 'TransientTransactionError')
    ) {
      return new DatabaseConflictError(error);
    }
    if (timeoutCodes.has(record.code as number) || timeoutNames.has(String(record.name))) {
      return new DatabaseTimeoutError(error);
    }
    if (unavailableCodes.has(record.code as number) || unavailableNames.has(String(record.name))) {
      return new DatabaseUnavailableError(error);
    }

    return new DatabaseExecutionError(error);
  }

  async execute<T>(handler: () => Promise<T>): Promise<T> {
    try {
      return await handler();
    } catch (error) {
      throw this.adapt(error);
    }
  }
}
