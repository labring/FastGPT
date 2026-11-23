import { afterEach, describe, expect, it, vi } from 'vitest';
import z from 'zod';
import { defineRepoToken, injectRepo } from '@fastgpt/dal/db/container';
import { OceanBaseRepositoryBase } from '@fastgpt/dal/db/oceanbase/base';
import { closeDbRuntime, configureDbRuntime, type DbRuntime } from '@fastgpt/dal/db/runtime';
import { createMockOceanBaseKysely } from '@fastgpt/dal/db/testing';
import { createManagedDbSession } from '@fastgpt/dal/db/transaction';
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
});
