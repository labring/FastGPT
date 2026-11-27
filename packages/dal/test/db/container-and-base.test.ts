import { afterEach, describe, expect, it, vi } from 'vitest';
import z from 'zod';
import { defineRepoToken, injectRepo } from '@fastgpt/dal/db/container';
import { DbConfigurationError } from '@fastgpt/dal/db/errors';
import { OceanBaseRepositoryBase } from '@fastgpt/dal/db/oceanbase/base';
import {
  closeDbRuntime,
  configureDbRuntime,
  getConfiguredDbRuntime,
  type DbRuntime
} from '@fastgpt/dal/db/runtime';
import { createMockOceanBaseKysely } from '@fastgpt/dal/db/testing';
import { createManagedDbSession, runInTransaction } from '@fastgpt/dal/db/transaction';
import type { DbSession } from '@fastgpt/dal/db/types';

type DemoDb = {
  demo_items: { _id: string; name: string };
};

const DemoReadSchema = z.object({ _id: z.string(), name: z.string() });

class DemoOceanBaseRepo extends OceanBaseRepositoryBase<
  DemoDb,
  'demo_items',
  typeof DemoReadSchema
> {
  constructor(runtime?: DbRuntime) {
    super({ tableName: 'demo_items', readSchema: DemoReadSchema, runtime });
  }

  public async findById(id: string, tx?: DbSession) {
    const row = await this.db(tx)
      .selectFrom('demo_items')
      .selectAll()
      .where('_id', '=', this.normalizeId(id))
      .executeTakeFirst();
    return this.parseNullable(row);
  }

  public async findByIdWithReadReplica({
    id,
    tx,
    useReadReplica
  }: {
    id: string;
    tx?: DbSession;
    useReadReplica?: boolean;
  }) {
    const row = await this.readDb({ tx, useReadReplica })
      .selectFrom('demo_items')
      .selectAll()
      .where('_id', '=', this.normalizeId(id))
      .executeTakeFirst();
    return this.parseNullable(row);
  }
}

describe('@fastgpt/dal/db DI container & OceanBaseRepositoryBase', () => {
  afterEach(async () => {
    await closeDbRuntime();
  });

  it('lazily resolves DI tokens per dialect/runtime without import-time side effects', async () => {
    const mongoFactory = vi.fn(() => ({ kind: () => 'mongo' }));
    const obFactory = vi.fn(() => ({ kind: () => 'oceanbase' }));
    const token = defineRepoToken('DemoToken', {
      mongo: mongoFactory,
      oceanbase: obFactory
    });

    const proxy = injectRepo(token);
    expect(mongoFactory).not.toHaveBeenCalled();
    expect(obFactory).not.toHaveBeenCalled();
    expect(Reflect.get(proxy, 'then')).toBeUndefined();

    configureDbRuntime({ dialect: 'oceanbase', mainWriteUrl: 'mysql://root@127.0.0.1:2881/app' });
    expect(proxy.kind()).toBe('oceanbase');
    expect(proxy.kind()).toBe('oceanbase');
    expect(obFactory).toHaveBeenCalledTimes(1);

    await closeDbRuntime();
    configureDbRuntime({ dialect: 'mongo', mainWriteUrl: 'mongodb://localhost:27017/app' });
    expect(proxy.kind()).toBe('mongo');
    expect(mongoFactory).toHaveBeenCalledTimes(1);
  });

  it('routes OceanBaseRepositoryBase queries through active tx and normalizes hex IDs', async () => {
    const mainMock = createMockOceanBaseKysely(() => ({
      rows: [{ _id: '68ee0bd23d17260b7829b137', name: 'main-row' }]
    }));
    const txMock = createMockOceanBaseKysely(() => ({
      rows: [{ _id: '68ee0bd23d17260b7829b137', name: 'tx-row' }]
    }));

    const runtime = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/app',
      oceanBaseExecutorResolver: ({ nativeTx }) => (nativeTx !== undefined ? nativeTx : mainMock.db)
    });

    const repo = new DemoOceanBaseRepo(runtime);
    expect(await repo.findById('68EE0BD23D17260B7829B137')).toEqual({
      _id: '68ee0bd23d17260b7829b137',
      name: 'main-row'
    });
    expect(mainMock.queries[0].parameters).toEqual(['68ee0bd23d17260b7829b137']);

    const { session } = createManagedDbSession({
      dialect: 'oceanbase',
      datasource: 'main',
      nativeTx: txMock.db
    });
    expect(await repo.findById('68ee0bd23d17260b7829b137', session)).toEqual({
      _id: '68ee0bd23d17260b7829b137',
      name: 'tx-row'
    });
    expect(txMock.queries).toHaveLength(1);
  });

  it('routes readDb({ useReadReplica }) to replica only outside transactions and honors logMode topology', async () => {
    const resolverCalls: Array<{
      datasource: string;
      hasNativeTx: boolean;
      useReadReplica?: boolean;
    }> = [];
    const writeMock = createMockOceanBaseKysely(() => ({
      rows: [{ _id: '68ee0bd23d17260b7829b137', name: 'write-row' }]
    }));
    const readMock = createMockOceanBaseKysely(() => ({
      rows: [{ _id: '68ee0bd23d17260b7829b137', name: 'read-row' }]
    }));
    const txMock = createMockOceanBaseKysely(() => ({
      rows: [{ _id: '68ee0bd23d17260b7829b137', name: 'tx-row' }]
    }));

    const sharedRuntime = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/app',
      mainReadUrl: 'mysql://root@127.0.0.1:2882/app',
      oceanBaseExecutorResolver: ({ datasource, nativeTx, useReadReplica }) => {
        resolverCalls.push({
          datasource,
          hasNativeTx: nativeTx !== undefined,
          useReadReplica
        });
        if (nativeTx !== undefined) {
          return nativeTx;
        }
        return useReadReplica ? readMock.db : writeMock.db;
      }
    });

    const repo = new DemoOceanBaseRepo(sharedRuntime);
    expect(await repo.findByIdWithReadReplica({ id: '68ee0bd23d17260b7829b137' })).toEqual({
      _id: '68ee0bd23d17260b7829b137',
      name: 'write-row'
    });
    expect(
      await repo.findByIdWithReadReplica({
        id: '68ee0bd23d17260b7829b137',
        useReadReplica: true
      })
    ).toEqual({
      _id: '68ee0bd23d17260b7829b137',
      name: 'read-row'
    });

    const { session } = createManagedDbSession({
      dialect: 'oceanbase',
      datasource: 'main',
      nativeTx: txMock.db
    });
    expect(
      await repo.findByIdWithReadReplica({
        id: '68ee0bd23d17260b7829b137',
        tx: session,
        useReadReplica: true
      })
    ).toEqual({
      _id: '68ee0bd23d17260b7829b137',
      name: 'tx-row'
    });

    expect(resolverCalls).toEqual([
      { datasource: 'main', hasNativeTx: false, useReadReplica: false },
      { datasource: 'main', hasNativeTx: false, useReadReplica: true },
      { datasource: 'main', hasNativeTx: true, useReadReplica: false }
    ]);

    // log 数据源在 shared 模式下解析为 main，在 separate 模式下保持 log
    class LogDemoRepo extends OceanBaseRepositoryBase<DemoDb, 'demo_items', typeof DemoReadSchema> {
      constructor(runtime: DbRuntime) {
        super({
          tableName: 'demo_items',
          readSchema: DemoReadSchema,
          datasource: 'log',
          runtime
        });
      }

      public async read() {
        await this.readDb({ useReadReplica: true }).selectFrom('demo_items').selectAll().execute();
      }
    }

    await new LogDemoRepo(sharedRuntime).read();
    expect(resolverCalls.at(-1)).toEqual({
      datasource: 'main',
      hasNativeTx: false,
      useReadReplica: true
    });

    await closeDbRuntime();
    const separateRuntime = configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/app',
      mainReadUrl: 'mysql://root@127.0.0.1:2882/app',
      logWriteUrl: 'mysql://root@127.0.0.1:2883/log',
      oceanBaseExecutorResolver: ({ datasource, nativeTx, useReadReplica }) => {
        resolverCalls.push({
          datasource,
          hasNativeTx: nativeTx !== undefined,
          useReadReplica
        });
        return writeMock.db;
      }
    });

    await new LogDemoRepo(separateRuntime).read();
    expect(resolverCalls.at(-1)).toEqual({
      datasource: 'log',
      hasNativeTx: false,
      useReadReplica: true
    });
  });

  it('routes mongo-only repos and transactions to fallbackMongo in OceanBase mixed mode while keeping dual-engine repos on OceanBase and pure OceanBase fail-closed', async () => {
    const mongoOnlyFactory = vi.fn((runtime: DbRuntime) => ({
      dialect: () => runtime.dialect,
      logMode: () => runtime.logMode
    }));
    const dualMongoFactory = vi.fn(() => ({ dialect: () => 'mongo' }));
    const dualObFactory = vi.fn(() => ({ dialect: () => 'oceanbase' }));

    const mongoOnlyToken = defineRepoToken('MongoOnlyDemoRepo', {
      mongo: mongoOnlyFactory
    });
    const dualToken = defineRepoToken('DualDemoRepo', {
      mongo: dualMongoFactory,
      oceanbase: dualObFactory
    });

    const mongoOnlyProxy = injectRepo(mongoOnlyToken);
    const dualProxy = injectRepo(dualToken);

    // 1. 纯 OceanBase（未挂载 fallbackMongo）：Mongo 专用仓储与显式 Mongo 事务均 fail-closed
    configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/app'
    });
    expect(dualProxy.dialect()).toBe('oceanbase');
    expect(() => mongoOnlyProxy.dialect()).toThrow(DbConfigurationError);
    await expect(runInTransaction(async () => 'x', { dialect: 'mongo' })).rejects.toThrow(
      DbConfigurationError
    );

    await closeDbRuntime();

    // 2. 混合模式（OceanBase 主运行时 + fallbackMongo）：
    //    - 双引擎仓储与默认事务继续走 OceanBase
    //    - Mongo 专用仓储与 { dialect: 'mongo' } 事务走伴生 Mongo（保留独立 logMode）
    const obTxRunner = vi.fn(async ({ execute }) => execute({ engine: 'oceanbase' }));
    const mongoTxRunner = vi.fn(async ({ execute }) => execute({ engine: 'mongo' }));
    const obClose = vi.fn(async () => undefined);
    const mongoClose = vi.fn(async () => undefined);

    configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/app',
      transactionRunner: obTxRunner,
      closeHandler: obClose,
      fallbackMongo: {
        mainWriteUrl: 'mongodb://127.0.0.1:27017/app',
        logWriteUrl: 'mongodb://127.0.0.1:27017/app_log',
        transactionRunner: mongoTxRunner,
        closeHandler: mongoClose
      }
    });

    expect(dualProxy.dialect()).toBe('oceanbase');
    expect(mongoOnlyProxy.dialect()).toBe('mongo');
    expect(mongoOnlyProxy.logMode()).toBe('separate');
    expect(dualMongoFactory).not.toHaveBeenCalled();

    const obDialect = await runInTransaction(async (tx) => tx.dialect);
    const mongoDialect = await runInTransaction(async (tx) => tx.dialect, { dialect: 'mongo' });
    expect(obDialect).toBe('oceanbase');
    expect(mongoDialect).toBe('mongo');
    expect(obTxRunner).toHaveBeenCalledTimes(1);
    expect(mongoTxRunner).toHaveBeenCalledTimes(1);

    await closeDbRuntime();
    expect(obClose).toHaveBeenCalledTimes(1);
    expect(mongoClose).toHaveBeenCalledTimes(1);
    expect(getConfiguredDbRuntime('mongo')).toBeUndefined();
  });
});
