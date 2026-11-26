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
  closeDbRuntime,
  configureDbRuntime,
  getConfiguredDbRuntime,
  getDbDialect,
  getDbRuntime
} from '@fastgpt/dal/db/runtime';

describe('@fastgpt/dal/db runtime & errors', () => {
  afterEach(async () => {
    await closeDbRuntime();
  });

  it('throws DbRuntimeNotConfiguredError before configuration and rejects empty mainWriteUrl', () => {
    expect(getConfiguredDbRuntime()).toBeUndefined();
    expect(() => getDbRuntime()).toThrow(DbRuntimeNotConfiguredError);
    expect(() => configureDbRuntime({ dialect: 'oceanbase', mainWriteUrl: '   ' })).toThrow(
      DbConfigurationError
    );
  });

  it('switches logMode between shared (fallback to main) and separate based on logWriteUrl', async () => {
    const shared = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt'
    });
    expect(getDbDialect()).toBe('oceanbase');
    expect(shared.logMode).toBe('shared');
    expect(shared.hasSeparateLogDatabase()).toBe(false);
    expect(shared.resolveEffectiveDatasource('log')).toBe('main');

    await closeDbRuntime();

    const separate = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      logWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt_log'
    });
    expect(separate.logMode).toBe('separate');
    expect(separate.hasSeparateLogDatabase()).toBe(true);
    expect(separate.resolveEffectiveDatasource('log')).toBe('log');

    await closeDbRuntime();

    const sameLogUrl = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      logWriteUrl: '  mysql://root@127.0.0.1:2881/fastgpt  '
    });
    expect(sameLogUrl.logMode).toBe('shared');
    expect(sameLogUrl.hasSeparateLogDatabase()).toBe(false);
    expect(sameLogUrl.resolveEffectiveDatasource('log')).toBe('main');
  });

  it('is idempotent for identical topology and rejects live topology mismatch until closed', async () => {
    const first = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/main'
    });
    const second = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: '  mysql://root@127.0.0.1:2881/main '
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
  });

  it('tracks separate mainReadUrl via hasReadReplica() and treats mainReadUrl equal to mainWriteUrl as no replica', async () => {
    const noReplica = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt'
    });
    expect(noReplica.hasReadReplica()).toBe(false);

    const sameUrlReplica = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      mainReadUrl: '  mysql://root@127.0.0.1:2881/fastgpt  '
    });
    expect(sameUrlReplica).toBe(noReplica);
    expect(sameUrlReplica.hasReadReplica()).toBe(false);

    expect(() =>
      configureDbRuntime({
        dialect: 'oceanbase',
        mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
        mainReadUrl: 'mysql://root@127.0.0.1:2882/fastgpt'
      })
    ).toThrow(DbConfigurationError);

    await closeDbRuntime();

    const withReplica = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      mainReadUrl: 'mysql://root@127.0.0.1:2882/fastgpt'
    });
    expect(withReplica.hasReadReplica()).toBe(true);
  });

  it('emits slow-query warn/error logs and isolates metric callback failures', () => {
    const operationCompleted = vi.fn(() => {
      throw new Error('metrics failure');
    });
    const warn = vi.fn();
    const error = vi.fn();
    const runtime = configureDbRuntime({
      dialect: 'mongo',
      mainWriteUrl: 'mongodb://localhost:27017/fastgpt',
      logger: { info: vi.fn(), warn, error },
      metrics: { operationCompleted }
    });

    runtime.recordOperation({ table: 'apps', operation: 'find', durationMs: 25, success: true });
    expect(error).not.toHaveBeenCalled();

    runtime.recordOperation({ table: 'apps', operation: 'list', durationMs: 650, success: true });
    expect(warn).toHaveBeenCalledWith(
      'Slow database operation > 500ms',
      expect.objectContaining({ dialect: 'mongo', table: 'apps', durationMs: 650 })
    );

    runtime.recordOperation({ table: 'apps', operation: 'agg', durationMs: 2_200, success: true });
    expect(error).toHaveBeenCalledWith(
      'Slow database operation > 2000ms',
      expect.objectContaining({ dialect: 'mongo', table: 'apps', durationMs: 2_200 })
    );
    expect(operationCompleted).toHaveBeenCalledTimes(3);
  });

  it('classifies Mongo and OceanBase unique, transient conflict, and outcome-unknown errors uniformly', () => {
    expect(isDbUniqueConflictError({ code: 11000 })).toBe(true);
    expect(isDbUniqueConflictError({ code: 'ER_DUP_ENTRY', errno: 1062 })).toBe(true);
    expect(isDbUniqueConflictError({ cause: { errno: 1062 } })).toBe(true);
    expect(isDbUniqueConflictError({ code: 'OTHER' })).toBe(false);

    expect(isDbTransientConflictError({ code: 112 })).toBe(true);
    expect(isDbTransientConflictError({ code: 'ER_LOCK_DEADLOCK', errno: 1213 })).toBe(true);
    expect(isDbTransientConflictError({ errno: 1205 })).toBe(true);
    expect(isDbTransientConflictError({ errno: 6002 })).toBe(true);
    expect(isDbTransientConflictError({ code: '6004' })).toBe(true);
    expect(isDbTransientConflictError({ errno: 6210 })).toBe(true);
    expect(isDbTransientConflictError({ errno: 6223 })).toBe(true);
    expect(isDbTransientConflictError({ errorLabels: ['TransientTransactionError'] })).toBe(true);

    // 事务提交结果未知（OB 4012/6225、Mongo UnknownTransactionCommitResult）严禁判定为可重试
    expect(isDbTransientConflictError({ errno: 4012 })).toBe(false);
    expect(isDbTransientConflictError({ errno: 6225 })).toBe(false);
    expect(isDbTransientConflictError({ errorLabels: ['UnknownTransactionCommitResult'] })).toBe(
      false
    );

    expect(isDbTransactionOutcomeUnknownError({ errno: 4012 })).toBe(true);
    expect(isDbTransactionOutcomeUnknownError({ code: '6225' })).toBe(true);
    expect(isDbTransactionOutcomeUnknownError({ message: 'Transaction result is unknown' })).toBe(
      true
    );
    expect(
      isDbTransactionOutcomeUnknownError({ errorLabels: ['UnknownTransactionCommitResult'] })
    ).toBe(true);
    expect(isDbTransactionOutcomeUnknownError(new DbTransactionOutcomeUnknownError())).toBe(true);
    expect(isDbTransactionOutcomeUnknownError({ errno: 6002 })).toBe(false);
  });

  it('rejects resolver, transactionRunner, and mongoModelBinder access while closing or closed', async () => {
    let releaseClose!: () => void;
    const closeGate = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });

    const transactionRunner = vi.fn(async () => {
      throw new Error('transactionRunner should not be called while closing or closed');
    });
    const oceanBaseExecutorResolver = vi.fn(() => {
      throw new Error('oceanBaseExecutorResolver should not be called while closing or closed');
    });
    const mongoModelBinder = vi.fn(() => {
      throw new Error('mongoModelBinder should not be called while closing or closed');
    });

    const runtime = configureDbRuntime({
      dialect: 'mongo',
      mainWriteUrl: 'mongodb://localhost:27017/fastgpt',
      transactionRunner,
      oceanBaseExecutorResolver,
      mongoModelBinder,
      closeHandler: () => closeGate
    });

    const closingPromise = runtime.close();
    expect(runtime.getState()).toBe('closing');
    expect(() => runtime.getTransactionRunner()).toThrow(DbConfigurationError);
    expect(() => runtime.getOceanBaseExecutorResolver()).toThrow(DbConfigurationError);
    expect(() =>
      runtime.bindMongoModel({
        name: 'demo',
        datasource: 'main'
      })
    ).toThrow(DbConfigurationError);

    releaseClose();
    await closingPromise;
    expect(runtime.getState()).toBe('closed');
    expect(() => runtime.getTransactionRunner()).toThrow(DbConfigurationError);
    expect(() => runtime.getOceanBaseExecutorResolver()).toThrow(DbConfigurationError);
    expect(() =>
      runtime.bindMongoModel({
        name: 'demo',
        datasource: 'main'
      })
    ).toThrow(DbConfigurationError);
    expect(transactionRunner).not.toHaveBeenCalled();
    expect(oceanBaseExecutorResolver).not.toHaveBeenCalled();
    expect(mongoModelBinder).not.toHaveBeenCalled();
  });
});
