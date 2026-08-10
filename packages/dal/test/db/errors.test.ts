import { describe, expect, it } from 'vitest';
import {
  DatabaseConflictError,
  DatabaseExecutionError,
  DatabaseInvalidArgumentError,
  DatabaseOperationError,
  DatabaseTimeoutError,
  DatabaseUnavailableError,
  DatabaseUniqueConstraintError,
  isDatabaseOperationError
} from '../../db';

describe('database error classes', () => {
  it('defines invalid argument and unique constraint semantics', () => {
    const cause = new Error('raw');
    const invalid = new DatabaseInvalidArgumentError(cause);
    const unique = new DatabaseUniqueConstraintError();

    expect(invalid).toMatchObject({ code: 'DB_INVALID_ARGUMENT', cause });
    expect(unique).toMatchObject({ code: 'DB_UNIQUE_CONSTRAINT', fields: [] });
    expect(invalid).not.toHaveProperty('operation');
    expect(invalid).not.toHaveProperty('mode');
    expect(invalid).not.toHaveProperty('outcome');
    expect(invalid).not.toHaveProperty('retryable');
  });

  it('defines conflict, timeout and unavailable errors', () => {
    expect(new DatabaseConflictError()).toMatchObject({ code: 'DB_CONFLICT' });
    expect(new DatabaseTimeoutError()).toMatchObject({ code: 'DB_TIMEOUT' });
    expect(new DatabaseUnavailableError()).toMatchObject({ code: 'DB_UNAVAILABLE' });
  });

  it('preserves execution error causes', () => {
    expect(new DatabaseExecutionError('raw')).toMatchObject({
      code: 'DB_OPERATION_FAILED',
      cause: 'raw'
    });
  });
});

describe('isDatabaseOperationError', () => {
  it('identifies stable database errors', () => {
    expect(isDatabaseOperationError(new DatabaseInvalidArgumentError())).toBe(true);
    expect(isDatabaseOperationError(new Error('raw'))).toBe(false);
    expect(new DatabaseInvalidArgumentError()).toBeInstanceOf(DatabaseOperationError);
  });
});
