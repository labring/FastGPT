import { describe, expect, it } from 'vitest';
import {
  DatabaseConflictError,
  DatabaseExecutionError,
  DatabaseInvalidArgumentError,
  DatabaseTimeoutError,
  DatabaseUnavailableError,
  DatabaseUniqueConstraintError
} from '../../db';
import { MongoErrorAdapter, MongoInvalidArgumentError } from '../../mongodb/errors';

const adapter = new MongoErrorAdapter();

describe('MongoErrorAdapter.adapt', () => {
  it('preserves an already adapted database error', () => {
    const error = new DatabaseInvalidArgumentError();
    expect(adapter.adapt(error)).toBe(error);
  });

  it('maps internal invalid arguments and Mongoose validation errors', () => {
    expect(adapter.adapt(new MongoInvalidArgumentError())).toBeInstanceOf(
      DatabaseInvalidArgumentError
    );
    expect(adapter.adapt({ name: 'ValidationError' })).toBeInstanceOf(DatabaseInvalidArgumentError);
    expect(adapter.adapt({ name: 'CastError' })).toBeInstanceOf(DatabaseInvalidArgumentError);
  });

  it('maps duplicate keys and only exposes sorted field names', () => {
    const error = adapter.adapt({
      code: 11000,
      keyPattern: { username: 1, teamId: 1 },
      keyValue: { username: 'secret' }
    });

    expect(error).toBeInstanceOf(DatabaseUniqueConstraintError);
    expect(error).toMatchObject({ fields: ['teamId', 'username'] });
    expect(error.message).not.toContain('secret');
    expect(adapter.adapt({ code: 11001 })).toMatchObject({ fields: [] });
  });

  it('maps conflict codes, names and transaction labels', () => {
    expect(adapter.adapt({ code: 112 })).toBeInstanceOf(DatabaseConflictError);
    expect(adapter.adapt({ codeName: 'WriteConflict' })).toBeInstanceOf(DatabaseConflictError);
    expect(
      adapter.adapt({
        hasErrorLabel: (label: string) => label === 'TransientTransactionError'
      })
    ).toBeInstanceOf(DatabaseConflictError);
  });

  it('maps timeout codes and names', () => {
    expect(adapter.adapt({ code: 50 })).toBeInstanceOf(DatabaseTimeoutError);
    expect(adapter.adapt({ name: 'MongoNetworkTimeoutError' })).toBeInstanceOf(
      DatabaseTimeoutError
    );
  });

  it('maps unavailable codes and names', () => {
    expect(adapter.adapt({ code: 91 })).toBeInstanceOf(DatabaseUnavailableError);
    expect(adapter.adapt({ name: 'MongoServerSelectionError' })).toBeInstanceOf(
      DatabaseUnavailableError
    );
  });

  it('falls back to an execution error', () => {
    expect(adapter.adapt('unknown')).toBeInstanceOf(DatabaseExecutionError);
  });
});

describe('MongoErrorAdapter.execute', () => {
  it('returns successful results', async () => {
    await expect(adapter.execute(async () => 'result')).resolves.toBe('result');
  });

  it('adapts rejected operations', async () => {
    await expect(
      adapter.execute(async () => {
        throw { code: 11000 };
      })
    ).rejects.toBeInstanceOf(DatabaseUniqueConstraintError);
  });
});
