import {
  DatabaseConflictError,
  DatabaseExecutionError,
  DatabaseInvalidArgumentError,
  DatabaseTimeoutError,
  DatabaseUnavailableError,
  DatabaseUniqueConstraintError,
  type DatabaseOperationError,
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

// 112 是 WriteConflict；244(NamespaceNotFound)/251(NoSuchTransaction) 不属于写冲突语义。
const conflictCodes = new Set([112]);
const timeoutCodes = new Set([50, 262]);
const unavailableCodes = new Set([6, 7, 89, 91, 189, 9001, 11600, 11602]);
const timeoutNames = new Set(['MongoNetworkTimeoutError', 'MongoOperationTimeoutError']);
const unavailableNames = new Set(['MongoNetworkError', 'MongoServerSelectionError']);

export class MongoErrorAdapter implements DatabaseErrorAdapter {
  adapt(error: unknown): DatabaseOperationError {
    if (isDatabaseOperationError(error)) return error;
    if (error instanceof MongoInvalidArgumentError) {
      return new DatabaseInvalidArgumentError(error);
    }

    const record = toErrorRecord(error);
    // 序列化/包装后的驱动错误可能携带字符串 code，统一归一化为数字再比较。
    const code = typeof record.code === 'number' ? record.code : Number(record.code);
    if (code === 11000 || code === 11001) {
      return new DatabaseUniqueConstraintError({
        fields: getUniqueFields(record),
        cause: error
      });
    }
    if (record.name === 'ValidationError' || record.name === 'CastError') {
      return new DatabaseInvalidArgumentError(error);
    }
    if (
      conflictCodes.has(code) ||
      record.codeName === 'WriteConflict' ||
      hasErrorLabel(record, 'TransientTransactionError')
    ) {
      return new DatabaseConflictError(error);
    }
    if (timeoutCodes.has(code) || timeoutNames.has(String(record.name))) {
      return new DatabaseTimeoutError(error);
    }
    if (unavailableCodes.has(code) || unavailableNames.has(String(record.name))) {
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
