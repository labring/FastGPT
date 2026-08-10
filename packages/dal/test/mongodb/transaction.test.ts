import type { ClientSession, Mongoose } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { getMongoSession, MongoTransactionRunner } from '../../mongodb/transaction';
import {
  DatabaseConflictError,
  DatabaseTimeoutError,
  DatabaseUnavailableError,
  DatabaseUniqueConstraintError
} from '../../db';

const createRuntime = () => {
  const session = {
    withTransaction: vi.fn(async (handler: () => Promise<unknown>) => handler()),
    endSession: vi.fn(async () => undefined)
  } as unknown as ClientSession;
  const client = {
    startSession: vi.fn(async () => session)
  } as unknown as Mongoose;
  return { client, session };
};

describe('getMongoSession', () => {
  it('returns undefined without a transaction context', () => {
    expect(getMongoSession()).toBeUndefined();
  });

  it('rejects a context owned by another adapter', () => {
    expect(() => getMongoSession(Symbol('sql-transaction'))).toThrow(
      'Invalid MongoDB transaction context'
    );
  });
});

describe('MongoTransactionRunner', () => {
  it('exposes the active session and cleans it after completion', async () => {
    const { client, session } = createRuntime();
    const runner = new MongoTransactionRunner(client);
    let context: symbol | undefined;

    const result = await runner.withTransaction(async (transactionContext) => {
      context = transactionContext;
      expect(getMongoSession(transactionContext)).toBe(session);
      return 'done';
    });

    expect(result).toBe('done');
    expect(session.withTransaction).toHaveBeenCalledWith(expect.any(Function), {
      maxCommitTimeMS: 60000
    });
    expect(session.endSession).toHaveBeenCalledOnce();
    expect(() => getMongoSession(context)).toThrow('Invalid MongoDB transaction context');
  });

  it('ends the session when the handler fails', async () => {
    const { client, session } = createRuntime();
    const runner = new MongoTransactionRunner(client);

    await expect(
      runner.withTransaction(async () => {
        throw new Error('failed');
      })
    ).rejects.toThrow('failed');
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('maps start, commit and end driver errors', async () => {
    const startClient = {
      startSession: vi.fn(async () => {
        throw { name: 'MongoServerSelectionError' };
      })
    } as unknown as Mongoose;
    await expect(
      new MongoTransactionRunner(startClient).withTransaction(async () => undefined)
    ).rejects.toBeInstanceOf(DatabaseUnavailableError);

    const { client: commitClient, session: commitSession } = createRuntime();
    vi.mocked(commitSession.withTransaction).mockRejectedValueOnce({ code: 50 });
    await expect(
      new MongoTransactionRunner(commitClient).withTransaction(async () => undefined)
    ).rejects.toBeInstanceOf(DatabaseTimeoutError);

    const { client: endClient, session: endSession } = createRuntime();
    vi.mocked(endSession.endSession).mockRejectedValueOnce({ name: 'MongoNetworkError' });
    await expect(
      new MongoTransactionRunner(endClient).withTransaction(async () => undefined)
    ).rejects.toBeInstanceOf(DatabaseUnavailableError);
  });

  it('preserves the handler error when session cleanup also fails', async () => {
    const { client, session } = createRuntime();
    vi.mocked(session.endSession).mockRejectedValueOnce(new Error('cleanup failed'));

    await expect(
      new MongoTransactionRunner(client).withTransaction(async () => {
        throw new Error('business failed');
      })
    ).rejects.toThrow('business failed');
  });

  it('returns driver causes to withTransaction and adapts the final error', async () => {
    const { client } = createRuntime();
    const rawError = {
      hasErrorLabel: (label: string) => label === 'TransientTransactionError'
    };

    await expect(
      new MongoTransactionRunner(client).withTransaction(async () => {
        throw new DatabaseConflictError(rawError);
      })
    ).rejects.toBeInstanceOf(DatabaseConflictError);
  });

  it('preserves non-retryable adapted errors from the handler', async () => {
    const { client } = createRuntime();
    const error = new DatabaseUniqueConstraintError();

    await expect(
      new MongoTransactionRunner(client).withTransaction(async () => {
        throw error;
      })
    ).rejects.toBe(error);
  });
});
