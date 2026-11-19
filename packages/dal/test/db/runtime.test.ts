import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DbConfigurationError,
  DbLogDatasourceNotConfiguredError,
  DbRuntimeNotConfiguredError,
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
  getDbRuntime,
  hasLogDatabase
} from '@fastgpt/dal/db/runtime';

describe('@fastgpt/dal/db runtime & errors', () => {
  afterEach(async () => {
    await closeDbRuntime();
  });

  it('throws DbRuntimeNotConfiguredError before configuration', () => {
    expect(getConfiguredDbRuntime()).toBeUndefined();
    expect(() => getDbRuntime()).toThrow(DbRuntimeNotConfiguredError);
  });

  it('keeps log database disabled without falling back to mainWriteUrl when logWriteUrl is omitted', () => {
    const runtime = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt'
    });

    expect(getDbDialect()).toBe('oceanbase');
    expect(getDbFamily()).toBe('sql');
    expect(hasLogDatabase()).toBe(false);
    expect(runtime.hasLogDatabase()).toBe(false);
    expect(() => runtime.resolveReadTarget({ datasource: 'log' })).toThrow(
      DbLogDatasourceNotConfiguredError
    );
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
    await expect(checkDbHealth('log')).rejects.toBeInstanceOf(DbLogDatasourceNotConfiguredError);
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
    expect(isDbTransientConflictError({ errorLabels: ['TransientTransactionError'] })).toBe(true);
    expect(isDbTransientConflictError(new Error('normal error'))).toBe(false);
  });
});
