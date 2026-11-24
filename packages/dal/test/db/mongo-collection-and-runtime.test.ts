import { Mongoose, Schema } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import z from 'zod';
import { DbConfigurationError } from '@fastgpt/dal/db/errors';
import { MongoRepositoryBase } from '@fastgpt/dal/db/mongo/base';
import { defineMongoCollection } from '@fastgpt/dal/db/mongo/collection';
import { createMongoRuntimeDeps } from '@fastgpt/dal/db/mongo/runtime';
import { closeDbRuntime, configureDbRuntime, type DbRuntime } from '@fastgpt/dal/db/runtime';
import { createManagedDbSession } from '@fastgpt/dal/db/transaction';
import type { DbSession } from '@fastgpt/dal/db/types';

const SimpleReadSchema = z.object({ _id: z.string() });

class DemoMongoRepo extends MongoRepositoryBase<Record<string, unknown>, typeof SimpleReadSchema> {
  constructor(
    collection: ReturnType<typeof defineMongoCollection<Record<string, unknown>>>,
    runtime?: DbRuntime
  ) {
    super({ collection, readSchema: SimpleReadSchema, runtime });
  }

  getBoundModel() {
    return this.model;
  }

  inspectReadOpts(params?: { tx?: DbSession; useReadReplica?: boolean }) {
    return this.readOpts(params);
  }
}

describe('@fastgpt/dal/db/mongo collection & constructor model binding', () => {
  afterEach(async () => {
    await closeDbRuntime();
  });

  it('rejects inline field index options and duplicate index names while preserving native Schema hooks', () => {
    expect(() =>
      defineMongoCollection({
        name: 'bad_inline_index',
        schema: new Schema({ teamId: { type: String, index: true } })
      })
    ).toThrow(DbConfigurationError);

    expect(() =>
      defineMongoCollection({
        name: 'bad_inline_unique',
        schema: new Schema({ code: { type: String, unique: true } })
      })
    ).toThrow(DbConfigurationError);

    expect(() =>
      defineMongoCollection({
        name: 'dup_indexes',
        schema: new Schema({ teamId: String }),
        indexes: [{ key: { teamId: 1 } }, { key: { teamId: 1 } }]
      })
    ).toThrow(DbConfigurationError);

    const nativeSchema = new Schema({ teamId: String, name: String }, { versionKey: false });
    nativeSchema.virtual('displayName').get(function (this: { name?: string }) {
      return `v:${this.name ?? ''}`;
    });
    const preValidateSpy = vi.fn();
    nativeSchema.pre('validate', function () {
      preValidateSpy();
    });

    const col = defineMongoCollection({
      name: 'native_hooks_demo',
      schema: nativeSchema,
      indexes: [{ key: { teamId: 1 }, options: { name: 'fg_native_team' } }]
    });

    expect(col.name).toBe('native_hooks_demo');
    expect(col.datasource).toBe('main');
    expect(col.schema.virtualpath('displayName')).toBeDefined();
    expect(col.schema.indexes()).toEqual([
      [{ teamId: 1 }, expect.objectContaining({ name: 'fg_native_team' })]
    ]);
  });

  it('binds readonly model idempotently in constructor and routes log collections across shared (main fallback) and separate modes', async () => {
    const mainCol = defineMongoCollection({
      name: 'demo_main_entities',
      datasource: 'main',
      schema: new Schema({ teamId: String }, { versionKey: false }),
      indexes: [{ key: { teamId: 1 } }]
    });
    const logCol = defineMongoCollection({
      name: 'demo_log_entries',
      datasource: 'log',
      schema: new Schema({ teamId: String }, { versionKey: false }),
      indexes: [{ key: { teamId: 1 } }]
    });

    // 1. shared 模式（默认）：log 集合透明回退绑定到 mainClient，零重复建池且不触发 OverwriteModelError
    const mainClient1 = new Mongoose();
    configureDbRuntime({
      dialect: 'mongo',
      mainWriteUrl: 'mongodb://localhost:27017/main',
      ...createMongoRuntimeDeps({ getMainClient: () => mainClient1 })
    });

    const repoA = new DemoMongoRepo(mainCol);
    const repoB = new DemoMongoRepo(mainCol);
    expect(repoA.getBoundModel()).toBe(repoB.getBoundModel());
    expect(repoA.getBoundModel().db).toBe(mainClient1.connection);

    const sharedLogRepo = new DemoMongoRepo(logCol);
    expect(sharedLogRepo.getBoundModel().db).toBe(mainClient1.connection);

    // 2. separate 模式（配置 logWriteUrl）：新 Repo 自动绑定至独立 Mongoose 实例
    await closeDbRuntime();
    const mainClient2 = new Mongoose();
    const separateLogClient = new Mongoose();
    configureDbRuntime({
      dialect: 'mongo',
      mainWriteUrl: 'mongodb://localhost:27017/main',
      logWriteUrl: 'mongodb://localhost:27017/log',
      ...createMongoRuntimeDeps({
        getMainClient: () => mainClient2,
        getLogClient: () => separateLogClient
      })
    });

    const repoC = new DemoMongoRepo(mainCol);
    const separateLogRepo = new DemoMongoRepo(logCol);
    expect(repoC.getBoundModel().db).toBe(mainClient2.connection);
    expect(repoC.getBoundModel()).not.toBe(repoA.getBoundModel());
    expect(separateLogRepo.getBoundModel().db).toBe(separateLogClient.connection);

    // 3. separate 模式但未注入 getLogClient 时暴露配置错误
    await closeDbRuntime();
    const mainClient3 = new Mongoose();
    configureDbRuntime({
      dialect: 'mongo',
      mainWriteUrl: 'mongodb://localhost:27017/main',
      logWriteUrl: 'mongodb://localhost:27017/log',
      ...createMongoRuntimeDeps({ getMainClient: () => mainClient3 })
    });

    expect(() => new DemoMongoRepo(logCol)).toThrow(DbConfigurationError);

    // 4. readOpts：非事务允许 secondaryPreferred，活跃事务内强制忽略从库走主节点
    const readRepo = new DemoMongoRepo(mainCol);
    expect(readRepo.inspectReadOpts()).toEqual({});
    expect(readRepo.inspectReadOpts({ useReadReplica: true })).toEqual({
      readPreference: 'secondaryPreferred'
    });
    const fakeSession = { id: 'mongo-session' };
    const { session } = createManagedDbSession({
      dialect: 'mongo',
      datasource: 'main',
      nativeTx: fakeSession
    });
    expect(readRepo.inspectReadOpts({ tx: session, useReadReplica: true })).toEqual({
      session: fakeSession
    });
  });
});
