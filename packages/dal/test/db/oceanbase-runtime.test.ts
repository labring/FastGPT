import { sql } from 'kysely';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DbConfigurationError } from '@fastgpt/dal/db/errors';
import {
  createOceanBaseKyselyLogger,
  createOceanBaseRuntimeDeps,
  extractOceanBaseQueryMeta
} from '@fastgpt/dal/db/oceanbase/runtime';
import { closeDbRuntime, configureDbRuntime } from '@fastgpt/dal/db/runtime';
import { createMockOceanBaseKysely } from '@fastgpt/dal/db/testing';

describe('@fastgpt/dal/db/oceanbase runtime, read replica & Kysely observability', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await closeDbRuntime();
  });

  it('extracts table and operation from Kysely AST and raw SQL queries', () => {
    const { db } = createMockOceanBaseKysely(() => ({ rows: [] }));

    const selectCompiled = db.selectFrom('apps as a').selectAll().where('id', '=', '1').compile();
    expect(extractOceanBaseQueryMeta(selectCompiled)).toEqual({
      operation: 'select',
      table: 'apps'
    });

    const insertCompiled = db.insertInto('app_registrations').values({ _id: '1' }).compile();
    expect(extractOceanBaseQueryMeta(insertCompiled)).toEqual({
      operation: 'insert',
      table: 'app_registrations'
    });

    const updateCompiled = db
      .updateTable('datasets')
      .set({ name: 'test' })
      .where('_id', '=', '1')
      .compile();
    expect(extractOceanBaseQueryMeta(updateCompiled)).toEqual({
      operation: 'update',
      table: 'datasets'
    });

    const deleteCompiled = db.deleteFrom('buffer_tts').where('_id', '=', '1').compile();
    expect(extractOceanBaseQueryMeta(deleteCompiled)).toEqual({
      operation: 'delete',
      table: 'buffer_tts'
    });

    const rawCompiled = sql
      .raw(
        '/* hint */ CREATE TABLE IF NOT EXISTS `fastgpt`.`app_registrations` (`_id` VARCHAR(24))'
      )
      .compile(db);
    expect(extractOceanBaseQueryMeta(rawCompiled)).toEqual({
      operation: 'create',
      table: 'app_registrations'
    });
  });

  it('forwards Kysely query and error events to DbRuntime.recordOperation without leaking query parameters', async () => {
    const operationCompleted = vi.fn();
    const warn = vi.fn();
    const error = vi.fn();
    const runtime = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      logger: { info: vi.fn(), warn, error },
      metrics: { operationCompleted }
    });
    const recordSpy = vi.spyOn(runtime, 'recordOperation');

    // 1. 正常查询与慢查询告警阈值
    let elapsedMs = 15;
    vi.spyOn(performance, 'now')
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => elapsedMs)
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 650)
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 2_300);

    const { db } = createMockOceanBaseKysely(() => ({ rows: [{ _id: '1' }] }), {
      log: createOceanBaseKyselyLogger({ datasource: 'main' })
    });

    await db.selectFrom('apps').selectAll().where('secret', '=', 'top-secret-value').execute();
    elapsedMs = 650;
    await db.updateTable('apps').set({ name: 'x' }).execute();
    elapsedMs = 2_300;
    await db.deleteFrom('apps').where('_id', '=', '1').execute();

    expect(recordSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        datasource: 'main',
        table: 'apps',
        operation: 'select',
        success: true
      })
    );
    expect(warn).toHaveBeenCalledWith(
      'Slow database operation > 500ms',
      expect.objectContaining({
        dialect: 'oceanbase',
        datasource: 'main',
        table: 'apps',
        operation: 'update'
      })
    );
    expect(error).toHaveBeenCalledWith(
      'Slow database operation > 2000ms',
      expect.objectContaining({
        dialect: 'oceanbase',
        datasource: 'main',
        table: 'apps',
        operation: 'delete'
      })
    );
    expect(operationCompleted).toHaveBeenCalledTimes(3);

    // 确认任何日志和指标回调均未泄露查询绑定参数
    const allMetaText = JSON.stringify([
      warn.mock.calls,
      error.mock.calls,
      operationCompleted.mock.calls
    ]);
    expect(allMetaText).not.toContain('top-secret-value');

    // 2. 查询失败时上报 success: false 且保留原始错误向外抛出
    const { db: failingDb } = createMockOceanBaseKysely(
      () => {
        throw new Error('ER_LOCK_DEADLOCK');
      },
      { log: createOceanBaseKyselyLogger({ datasource: 'log' }) }
    );
    await expect(
      failingDb.insertInto('app_chat_logs').values({ _id: '1' }).execute()
    ).rejects.toThrow('ER_LOCK_DEADLOCK');
    expect(recordSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        datasource: 'log',
        table: 'app_chat_logs',
        operation: 'insert',
        success: false
      })
    );

    // 3. 未配置 DbRuntime 时安全跳过（不抛错）
    await closeDbRuntime();
    const { db: unconfiguredDb } = createMockOceanBaseKysely(() => ({ rows: [] }), {
      log: createOceanBaseKyselyLogger({ datasource: 'main' })
    });
    await expect(unconfiguredDb.selectFrom('apps').selectAll().execute()).resolves.toEqual([]);
  });

  it('routes main write, optional read replica, and shared/separate log pools lazily', async () => {
    expect(() => createOceanBaseRuntimeDeps({ mainWriteUrl: '   ' })).toThrow(DbConfigurationError);

    // 1. 未配置独立读库与日志库时，所有请求透明复用同一个 mainDb 实例
    const sharedDeps = createOceanBaseRuntimeDeps({
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/main',
      mainReadUrl: '  mysql://root@127.0.0.1:2881/main ',
      logWriteUrl: 'mysql://root@127.0.0.1:2881/main'
    });
    const mainWrite = sharedDeps.oceanBaseExecutorResolver({
      datasource: 'main',
      useReadReplica: false
    });
    const mainReadFallback = sharedDeps.oceanBaseExecutorResolver({
      datasource: 'main',
      useReadReplica: true
    });
    const logShared = sharedDeps.oceanBaseExecutorResolver({
      datasource: 'log',
      useReadReplica: true
    });
    expect(mainReadFallback).toBe(mainWrite);
    expect(logShared).toBe(mainWrite);
    await sharedDeps.closeHandler();

    // 2. 配置独立读库与日志库：
    // - main + useReadReplica: true -> mainReadDb
    // - main + nativeTx -> nativeTx
    // - log (separate) -> 始终走 logDb（不切到 mainReadDb）
    const separateDeps = createOceanBaseRuntimeDeps({
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/main',
      mainReadUrl: 'mysql://root@127.0.0.1:2882/main_ro',
      logWriteUrl: 'mysql://root@127.0.0.1:2883/log'
    });
    const writePool = separateDeps.oceanBaseExecutorResolver({
      datasource: 'main',
      useReadReplica: false
    });
    const readPool = separateDeps.oceanBaseExecutorResolver({
      datasource: 'main',
      useReadReplica: true
    });
    const logPool = separateDeps.oceanBaseExecutorResolver({
      datasource: 'log',
      useReadReplica: true
    });
    const fakeNativeTx = { isTx: true };
    const txPool = separateDeps.oceanBaseExecutorResolver({
      datasource: 'main',
      nativeTx: fakeNativeTx,
      useReadReplica: true
    });

    expect(readPool).not.toBe(writePool);
    expect(logPool).not.toBe(writePool);
    expect(logPool).not.toBe(readPool);
    expect(txPool).toBe(fakeNativeTx);
    await separateDeps.closeHandler();

    // 3. 懒创建：未触发任何查询/解析时直接 closeHandler 也不报错
    const untouchedDeps = createOceanBaseRuntimeDeps({
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/main',
      mainReadUrl: 'mysql://root@127.0.0.1:2882/main_ro',
      logWriteUrl: 'mysql://root@127.0.0.1:2883/log'
    });
    await expect(untouchedDeps.closeHandler()).resolves.toBeUndefined();
  });

  it('defers mysql2 pool creation until query execution and blocks post-close pool resurrection or maxIdle timer leaks', async () => {
    const countTimeoutHandles = () =>
      process.getActiveResourcesInfo().filter((resource) => resource === 'Timeout').length;

    const baselineTimeouts = countTimeoutHandles();

    const deps = createOceanBaseRuntimeDeps({
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/main?maxIdle=1&idleTimeout=60000',
      mainReadUrl: 'mysql://root@127.0.0.1:2882/main_ro?maxIdle=1&idleTimeout=60000',
      logWriteUrl: 'mysql://root@127.0.0.1:2883/log?maxIdle=1&idleTimeout=60000'
    });

    // 1. 仅解析执行器未执行 SQL 前不得创建 mysql2 Pool 或开启 maxIdle 定时器
    const writePool = deps.oceanBaseExecutorResolver({ datasource: 'main', useReadReplica: false });
    const readPool = deps.oceanBaseExecutorResolver({ datasource: 'main', useReadReplica: true });
    const logPool = deps.oceanBaseExecutorResolver({ datasource: 'log', useReadReplica: false });
    expect(readPool).not.toBe(writePool);
    expect(logPool).not.toBe(writePool);
    expect(countTimeoutHandles()).toBe(baselineTimeouts);

    // 2. 未执行任何 SQL 即关闭，不应残留任何 mysql2 定时器，且重复 closeHandler 幂等
    await expect(deps.closeHandler()).resolves.toBeUndefined();
    await expect(deps.closeHandler()).resolves.toBeUndefined();
    expect(countTimeoutHandles()).toBe(baselineTimeouts);

    // 3. 关闭后继续使用已缓存的 Kysely 实例执行查询或再次向旧 resolver/transactionRunner 申请执行器，均须拒绝且不得建池
    await expect(readPool.selectFrom('apps').selectAll().execute()).rejects.toThrow(
      DbConfigurationError
    );
    expect(countTimeoutHandles()).toBe(baselineTimeouts);

    expect(() =>
      deps.oceanBaseExecutorResolver({ datasource: 'main', useReadReplica: false })
    ).toThrow(DbConfigurationError);
    expect(() =>
      deps.oceanBaseExecutorResolver({ datasource: 'main', useReadReplica: true })
    ).toThrow(DbConfigurationError);
    await expect(
      deps.transactionRunner({ datasource: 'main', execute: async () => undefined })
    ).rejects.toThrow(DbConfigurationError);
    expect(countTimeoutHandles()).toBe(baselineTimeouts);

    // 4. 在 DbRuntime 进入 closing/closed 态后即刻拒绝继续分配执行器与事务入口
    let releaseClose!: () => void;
    const closeGate = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
    const guardedDeps = createOceanBaseRuntimeDeps({
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/main'
    });
    const runtime = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/main',
      oceanBaseExecutorResolver: guardedDeps.oceanBaseExecutorResolver,
      transactionRunner: guardedDeps.transactionRunner,
      closeHandler: async () => {
        await guardedDeps.closeHandler();
        await closeGate;
      }
    });

    const closingPromise = runtime.close();
    expect(runtime.getState()).toBe('closing');
    expect(() => runtime.getOceanBaseExecutorResolver()).toThrow(DbConfigurationError);
    expect(() => runtime.getTransactionRunner()).toThrow(DbConfigurationError);

    releaseClose();
    await closingPromise;
    expect(runtime.getState()).toBe('closed');
    expect(() => runtime.getOceanBaseExecutorResolver()).toThrow(DbConfigurationError);
    expect(() => runtime.getTransactionRunner()).toThrow(DbConfigurationError);
  });
});
