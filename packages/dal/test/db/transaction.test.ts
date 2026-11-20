import { afterEach, describe, expect, it } from 'vitest';
import {
  DbConfigurationError,
  DbLogDatasourceNotConfiguredError,
  DbTransactionConflictError
} from '@fastgpt/dal/db/errors';
import { closeDbRuntime, configureDbRuntime } from '@fastgpt/dal/db/runtime';
import {
  createManagedDbSession,
  runInTransaction,
  unwrapNativeDbSession
} from '@fastgpt/dal/db/transaction';

describe('@fastgpt/dal/db transaction & afterCommit', () => {
  afterEach(async () => {
    await closeDbRuntime();
  });

  it('keeps native transaction handle hidden from business DbSession and detects family/dialect mismatch', () => {
    const rawHandle = { secretConnection: true };
    const { session } = createManagedDbSession({
      dialect: 'mongo',
      datasource: 'main',
      nativeTx: rawHandle
    });

    expect(Object.keys(session).sort()).toEqual([
      'afterCommit',
      'datasource',
      'dialect',
      'family',
      'id'
    ]);
    expect(unwrapNativeDbSession(session, { family: 'mongo', dialect: 'mongo' })).toBe(rawHandle);
    expect(() => unwrapNativeDbSession(session, { family: 'sql' })).toThrow(DbConfigurationError);
  });

  it('retries transient conflicts, discards aborted afterCommit callbacks, and runs committed hooks in FIFO order', async () => {
    const events: string[] = [];
    let attempt = 0;

    configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      transactionRunner: async ({ execute }) => {
        attempt += 1;
        const result = await execute({ txAttempt: attempt });
        events.push(`db-committed-${attempt}`);
        return result;
      }
    });

    const output = await runInTransaction(async (tx) => {
      tx.afterCommit(() => {
        events.push(`afterCommit-a-attempt-${attempt}`);
      });
      tx.afterCommit(() => {
        events.push(`afterCommit-b-attempt-${attempt}`);
      });

      if (attempt === 1) {
        throw new DbTransactionConflictError(new Error('optimistic lock failed'));
      }
      return 'ok';
    });

    expect(output).toBe('ok');
    expect(attempt).toBe(2);
    expect(events).toEqual([
      'db-committed-2',
      'afterCommit-a-attempt-2',
      'afterCommit-b-attempt-2'
    ]);
  });

  it('routes log transaction to main pool in shared mode while preserving logical datasource isolation, and rejects in disabled mode', async () => {
    const seenRunnerDatasources: string[] = [];
    configureDbRuntime({
      dialect: 'postgres',
      mainWriteUrl: 'postgres://localhost:5432/main',
      transactionRunner: async ({ datasource, execute }) => {
        seenRunnerDatasources.push(datasource);
        return execute({ txPool: datasource });
      }
    });

    const result = await runInTransaction(
      async (tx) => {
        expect(tx.datasource).toBe('log');
        expect(unwrapNativeDbSession(tx, { family: 'sql', datasource: 'log' })).toEqual({
          txPool: 'main'
        });
        expect(() => unwrapNativeDbSession(tx, { family: 'sql', datasource: 'main' })).toThrow(
          DbConfigurationError
        );
        return 'shared-ok';
      },
      { datasource: 'log' }
    );

    expect(result).toBe('shared-ok');
    expect(seenRunnerDatasources).toEqual(['main']);

    await closeDbRuntime();
    configureDbRuntime({
      dialect: 'postgres',
      mainWriteUrl: 'postgres://localhost:5432/main',
      logDisabled: true,
      transactionRunner: async ({ execute }) => execute({})
    });

    await expect(runInTransaction(async () => 'ok', { datasource: 'log' })).rejects.toBeInstanceOf(
      DbLogDatasourceNotConfiguredError
    );
  });
});
