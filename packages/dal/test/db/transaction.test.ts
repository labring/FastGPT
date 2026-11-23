import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DbConfigurationError,
  DbTransactionConflictError,
  DbTransactionOutcomeUnknownError,
  isDbTransactionOutcomeUnknownError,
  isDbTransientConflictError
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

  it('routes log transaction to main pool in shared mode and log pool in separate mode while preserving logical datasource isolation', async () => {
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
      logWriteUrl: 'postgres://localhost:5432/log',
      transactionRunner: async ({ datasource, execute }) => {
        seenRunnerDatasources.push(datasource);
        return execute({ txPool: datasource });
      }
    });

    const separateResult = await runInTransaction(
      async (tx) => {
        expect(tx.datasource).toBe('log');
        expect(unwrapNativeDbSession(tx, { family: 'sql', datasource: 'log' })).toEqual({
          txPool: 'log'
        });
        return 'separate-ok';
      },
      { datasource: 'log' }
    );
    expect(separateResult).toBe('separate-ok');
    expect(seenRunnerDatasources).toEqual(['main', 'log']);
  });

  it('NEVER retries OceanBase 4012 / 6225 or Mongo UnknownTransactionCommitResult and surfaces DbTransactionOutcomeUnknownError with cause', async () => {
    const outcomeUnknownCases: Array<{ label: string; error: unknown }> = [
      {
        label: 'OceanBase bare errno 4012',
        error: Object.assign(new Error('Timeout'), { errno: 4012 })
      },
      {
        label: 'OceanBase string code 4012 with unknown message',
        error: Object.assign(new Error('Transaction result is unknown'), { code: '4012' })
      },
      {
        label: 'OceanBase internal errno 6225',
        error: Object.assign(new Error('OB_TRANS_UNKNOWN'), { errno: 6225 })
      },
      { label: 'OceanBase string code 6225', error: { code: '6225' } },
      {
        label: 'OceanBase sqlMessage unknown commit state',
        error: { sqlMessage: 'Transaction result is unknown' }
      },
      {
        label: 'Mongo UnknownTransactionCommitResult label',
        error: Object.assign(new Error('commit unknown'), {
          errorLabels: ['UnknownTransactionCommitResult']
        })
      },
      {
        label:
          'Mongo error carrying both TransientTransactionError and UnknownTransactionCommitResult',
        error: {
          hasErrorLabel: (label: string) =>
            label === 'TransientTransactionError' || label === 'UnknownTransactionCommitResult'
        }
      },
      {
        label: 'Explicit DbTransactionOutcomeUnknownError',
        error: new DbTransactionOutcomeUnknownError(new Error('already wrapped'))
      }
    ];

    for (const testCase of outcomeUnknownCases) {
      await closeDbRuntime();
      let attempts = 0;
      const afterCommitSpy = vi.fn();

      configureDbRuntime({
        dialect: 'oceanbase',
        mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
        transactionRunner: async ({ execute }) => {
          attempts += 1;
          await execute({ attempt: attempts });
          throw testCase.error;
        }
      });

      expect(isDbTransactionOutcomeUnknownError(testCase.error)).toBe(true);
      expect(isDbTransientConflictError(testCase.error)).toBe(false);

      let caught: unknown;
      try {
        await runInTransaction(async (tx) => {
          tx.afterCommit(afterCommitSpy);
          return 'should-not-succeed';
        });
      } catch (err) {
        caught = err;
      }

      expect(attempts, testCase.label).toBe(1);
      expect(afterCommitSpy, testCase.label).not.toHaveBeenCalled();
      expect(caught, testCase.label).toBeInstanceOf(DbTransactionOutcomeUnknownError);
      const outcomeErr = caught as DbTransactionOutcomeUnknownError;
      expect(outcomeErr.code).toBe('DB_TRANSACTION_OUTCOME_UNKNOWN');
      if (testCase.error instanceof DbTransactionOutcomeUnknownError) {
        expect(outcomeErr).toBe(testCase.error);
      } else {
        expect(outcomeErr.cause).toBe(testCase.error);
      }
    }
  });

  it('retries provably rolled-back conflict errors (OceanBase 6002/6004/6210/6223, MySQL 1213/1205, PG 40001/40P01, Mongo 112)', async () => {
    const retryableErrors: Array<{ label: string; error: unknown }> = [
      { label: 'OceanBase 6002', error: { errno: 6002 } },
      { label: 'OceanBase 6004', error: { code: '6004' } },
      { label: 'OceanBase 6210', error: { errno: 6210 } },
      { label: 'OceanBase 6223', error: { errno: 6223 } },
      { label: 'MySQL 1213 deadlock', error: { errno: 1213, code: 'ER_LOCK_DEADLOCK' } },
      { label: 'MySQL 1205 lock wait timeout', error: { errno: 1205 } },
      { label: 'PG 40001 serialization failure', error: { code: '40001' } },
      { label: 'PG 40P01 deadlock', error: { code: '40P01' } },
      { label: 'Mongo 112 WriteConflict', error: { code: 112 } }
    ];

    for (const testCase of retryableErrors) {
      await closeDbRuntime();
      let attempts = 0;

      configureDbRuntime({
        dialect: 'oceanbase',
        mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
        transactionRunner: async ({ execute }) => {
          attempts += 1;
          return execute({ attempt: attempts });
        }
      });

      const result = await runInTransaction(async () => {
        if (attempts === 1) {
          throw testCase.error;
        }
        return `recovered:${testCase.label}`;
      });

      expect(attempts, testCase.label).toBe(2);
      expect(result).toBe(`recovered:${testCase.label}`);
    }
  });
});
