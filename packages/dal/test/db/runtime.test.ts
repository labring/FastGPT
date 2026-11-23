import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DbConfigurationError,
  DbRuntimeNotConfiguredError,
  DbTransactionOutcomeUnknownError,
  isDbTransactionOutcomeUnknownError,
  isDbTransientConflictError,
  isDbUniqueConflictError
} from '@fastgpt/dal/db/errors';
import {
  checkDbHealth,
  closeDbRuntime,
  configureDbRuntime,
  getConfiguredDbRuntime,
  getDbDialect,
  getDbFamily,
  getDbLogMode,
  getDbRuntime,
  hasSeparateLogDatabase
} from '@fastgpt/dal/db/runtime';

describe('@fastgpt/dal/db runtime & errors', () => {
  afterEach(async () => {
    await closeDbRuntime();
  });

  it('throws DbRuntimeNotConfiguredError before configuration', () => {
    expect(getConfiguredDbRuntime()).toBeUndefined();
    expect(() => getDbRuntime()).toThrow(DbRuntimeNotConfiguredError);
  });

  it('defaults logMode to shared (fallback to main pool) when logWriteUrl is omitted, and switches to separate when configured', async () => {
    const sharedRuntime = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      mainReadUrl: 'mysql://root@127.0.0.1:2882/fastgpt'
    });

    expect(getDbDialect()).toBe('oceanbase');
    expect(getDbFamily()).toBe('sql');
    expect(getDbLogMode()).toBe('shared');
    expect(hasSeparateLogDatabase()).toBe(false);
    expect(sharedRuntime.hasSeparateLogDatabase()).toBe(false);
    expect(sharedRuntime.resolveReadTarget({ datasource: 'log' })).toEqual({
      datasource: 'main',
      target: 'write'
    });
    expect(sharedRuntime.resolveReadTarget({ datasource: 'log', useReadReplica: true })).toEqual({
      datasource: 'main',
      target: 'readReplica'
    });

    await closeDbRuntime();

    const separateRuntime = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      logWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt_log',
      logReadUrl: 'mysql://root@127.0.0.1:2882/fastgpt_log'
    });

    expect(getDbLogMode()).toBe('separate');
    expect(hasSeparateLogDatabase()).toBe(true);
    expect(separateRuntime.hasSeparateLogDatabase()).toBe(true);
    expect(separateRuntime.resolveReadTarget({ datasource: 'log' })).toEqual({
      datasource: 'log',
      target: 'write'
    });
    expect(separateRuntime.resolveReadTarget({ datasource: 'log', useReadReplica: true })).toEqual({
      datasource: 'log',
      target: 'readReplica'
    });
  });

  it('rejects empty mainWriteUrl or logReadUrl without logWriteUrl', () => {
    expect(() =>
      configureDbRuntime({
        dialect: 'postgres',
        mainWriteUrl: '   '
      })
    ).toThrow(DbConfigurationError);

    expect(() =>
      configureDbRuntime({
        dialect: 'postgres',
        mainWriteUrl: 'postgres://localhost:5432/main',
        logReadUrl: 'postgres://localhost:5432/log_replica'
      })
    ).toThrow(DbConfigurationError);
  });

  it('is idempotent for identical topology and rejects live topology mismatch until closed', async () => {
    const first = configureDbRuntime({
      dialect: 'postgres',
      mainWriteUrl: 'postgres://localhost:5432/main',
      mainReadUrl: 'postgres://localhost:5432/read'
    });
    const second = configureDbRuntime({
      dialect: 'postgres',
      mainWriteUrl: '  postgres://localhost:5432/main ',
      mainReadUrl: 'postgres://localhost:5432/read'
    });

    expect(first).toBe(second);

    expect(() =>
      configureDbRuntime({
        dialect: 'mongo',
        mainWriteUrl: 'mongodb://localhost:27017/fastgpt'
      })
    ).toThrow(DbConfigurationError);

    await closeDbRuntime();
    const afterClose = configureDbRuntime({
      dialect: 'mongo',
      mainWriteUrl: 'mongodb://localhost:27017/fastgpt'
    });
    expect(afterClose.dialect).toBe('mongo');
    expect(afterClose.family).toBe('mongo');
  });

  it('forces read traffic onto write pool whenever an active transaction is present', () => {
    const runtime = configureDbRuntime({
      dialect: 'postgres',
      mainWriteUrl: 'postgres://localhost:5432/main',
      mainReadUrl: 'postgres://localhost:5432/replica',
      logWriteUrl: 'postgres://localhost:5432/log',
      logReadUrl: 'postgres://localhost:5432/log_replica'
    });

    expect(runtime.resolveReadTarget({ useReadReplica: true, hasActiveTx: false })).toEqual({
      datasource: 'main',
      target: 'readReplica'
    });
    expect(runtime.resolveReadTarget({ useReadReplica: true, hasActiveTx: true })).toEqual({
      datasource: 'main',
      target: 'write'
    });
    expect(
      runtime.resolveReadTarget({ datasource: 'log', useReadReplica: true, hasActiveTx: false })
    ).toEqual({
      datasource: 'log',
      target: 'readReplica'
    });
  });

  it('emits unified slow-query warn (>=500ms) and error (>=2000ms) logs and metrics', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    const slowQuery = vi.fn();
    const operationCompleted = vi.fn();
    const healthCheck = vi.fn();

    const runtime = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      logger,
      metrics: { slowQuery, operationCompleted, healthCheck },
      healthChecker: async () => undefined
    });

    runtime.recordOperation({ table: 'apps', operation: 'find', durationMs: 120, success: true });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();

    runtime.recordOperation({ table: 'apps', operation: 'list', durationMs: 650, success: true });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(slowQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ severity: 'warn', durationMs: 650 })
    );

    runtime.recordOperation({
      table: 'apps',
      operation: 'aggregate',
      durationMs: 2_300,
      success: true
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(slowQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ severity: 'error', durationMs: 2_300 })
    );
    expect(operationCompleted).toHaveBeenCalledTimes(3);

    await checkDbHealth('main');
    expect(healthCheck).toHaveBeenCalledWith(
      expect.objectContaining({ dialect: 'oceanbase', datasource: 'main', success: true })
    );
    await checkDbHealth('log');
    expect(healthCheck).toHaveBeenLastCalledWith(
      expect.objectContaining({ dialect: 'oceanbase', datasource: 'log', success: true })
    );
  });

  it('classifies Mongo, PostgreSQL, and OceanBase/MySQL unique & transient conflict errors uniformly', () => {
    expect(isDbUniqueConflictError({ code: 11000 })).toBe(true);
    expect(isDbUniqueConflictError({ code: '23505' })).toBe(true);
    expect(isDbUniqueConflictError({ code: 'ER_DUP_ENTRY', errno: 1062 })).toBe(true);
    expect(isDbUniqueConflictError({ cause: { code: '23505' } })).toBe(true);
    expect(isDbUniqueConflictError({ code: '42P01' })).toBe(false);

    expect(isDbTransientConflictError({ code: 112 })).toBe(true);
    expect(isDbTransientConflictError({ code: '40001' })).toBe(true);
    expect(isDbTransientConflictError({ code: '40P01' })).toBe(true);
    expect(isDbTransientConflictError({ code: 'ER_LOCK_DEADLOCK', errno: 1213 })).toBe(true);
    expect(isDbTransientConflictError({ errno: 1205 })).toBe(true);
    expect(isDbTransientConflictError({ errno: 4012 })).toBe(false);
    expect(isDbTransientConflictError({ code: '4012' })).toBe(false);
    expect(isDbTransientConflictError({ errno: 6225 })).toBe(false);
    expect(isDbTransientConflictError({ code: '6225' })).toBe(false);
    expect(isDbTransientConflictError({ errno: 6002 })).toBe(true);
    expect(isDbTransientConflictError({ code: '6004' })).toBe(true);
    expect(isDbTransientConflictError({ errno: 6210 })).toBe(true);
    expect(isDbTransientConflictError({ errno: 6223 })).toBe(true);
    expect(isDbTransientConflictError({ errorLabels: ['TransientTransactionError'] })).toBe(true);
    expect(isDbTransientConflictError({ errorLabels: ['UnknownTransactionCommitResult'] })).toBe(
      false
    );
    expect(isDbTransientConflictError(new Error('normal error'))).toBe(false);

    expect(isDbTransactionOutcomeUnknownError({ errno: 4012 })).toBe(true);
    expect(isDbTransactionOutcomeUnknownError({ code: '4012' })).toBe(true);
    expect(isDbTransactionOutcomeUnknownError({ errno: 6225 })).toBe(true);
    expect(isDbTransactionOutcomeUnknownError({ code: '6225' })).toBe(true);
    expect(isDbTransactionOutcomeUnknownError({ message: 'Transaction result is unknown' })).toBe(
      true
    );
    expect(
      isDbTransactionOutcomeUnknownError({ errorLabels: ['UnknownTransactionCommitResult'] })
    ).toBe(true);
    expect(isDbTransactionOutcomeUnknownError(new DbTransactionOutcomeUnknownError())).toBe(true);
    expect(isDbTransactionOutcomeUnknownError({ errno: 6002 })).toBe(false);
    expect(isDbTransactionOutcomeUnknownError(new Error('normal error'))).toBe(false);
  });
});
