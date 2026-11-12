import { describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { backfillOpenApiKeyType } from '@/migration/tasks/4180/20261104_backfill_openapi_key_type';
import { backfillOpenApiKeyTypeRecord } from '@/migration/tasks/4180/20261104_backfill_openapi_key_type/service';
import type { SystemMigrationContext } from '@/migration/registry';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { getOpenApiTypeFilter } from '@fastgpt/service/support/openapi/utils';
import listKeys from '@/pages/api/support/openapi/list';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
vi.mock('@/migration/constants', () => ({ systemMigrationBatchSize: 2 }));
/** 仅模拟升级框架的持久恢复状态；业务记录读写使用真实隔离 Mongo。 */
const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  let failures: SystemMigrationFailedRecord[] = [];
  const context = {
    migrationId: '20261104_backfill_openapi_key_type',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint ? schema.parse(structuredClone(checkpoint)) : undefined,
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    getFailedRecords: async () => structuredClone(failures),
    reportFailedRecords: vi.fn(async (value: SystemMigrationFailedRecord[]) => {
      failures = structuredClone(value);
    }),
    assertActive: vi.fn(async () => undefined),
    reportProgress: vi.fn<SystemMigrationContext['reportProgress']>(async () => undefined),
    fail: vi.fn(async (input: SystemMigrationFailureInput): Promise<never> => {
      failures = structuredClone(input.failedRecords ?? failures);
      throw new Error(input.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, failures: () => failures };
};

const seed = async (overrides: Record<string, unknown> = {}) => {
  const record = {
    _id: new Types.ObjectId(),
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    apiKey: 'fixture-secret',
    ...overrides
  };
  await MongoOpenApi.collection.insertOne(record as any);
  return record;
};
describe('backfillOpenApiKeyType', () => {
  it.each([false, true])(
    'keeps old-version writes after the fixed checkpoint visible and counted (initial keys: %s)',
    async (hasInitialKeys) => {
      const {
        owner,
        members: [member]
      } = await getFakeUsers(1);
      if (hasInitialKeys) await seed();
      const state = createContext();
      const save = state.context.saveCheckpoint.getMockImplementation()!;
      const defaultAppId = new Types.ObjectId().toString().toUpperCase();
      const lateIds: string[] = [];
      state.context.saveCheckpoint.mockImplementationOnce(async (value) => {
        await save(value);
        // 模拟旧实例在首次 checkpoint 固定上界之后写入，不能依靠迁移将其补齐。
        for (const appId of [undefined, defaultAppId]) {
          const key = await seed({
            teamId: new Types.ObjectId(owner.teamId),
            tmbId: new Types.ObjectId(owner.tmbId),
            name: 'late legacy key',
            createTime: new Date(),
            ...(appId ? { appId } : {})
          });
          lateIds.push(String(key._id));
        }
      });

      expect(await backfillOpenApiKeyType(state.context)).toEqual({ keys: hasInitialKeys ? 1 : 0 });
      expect(await MongoOpenApi.collection.countDocuments({ type: { $exists: false } })).toBe(2);
      expect(
        await MongoOpenApi.countDocuments({
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          ...getOpenApiTypeFilter(ApiKeyTypeEnum.personal)
        })
      ).toBe(2);
      const ownList = await Call(listKeys, { auth: owner });
      expect(ownList.error).toBeUndefined();
      expect(ownList.data.map((key: { _id: string }) => key._id).sort()).toEqual(lateIds.sort());
      expect(ownList.data.every((key: { type: string }) => key.type === 'personal')).toBe(true);
      expect(
        ownList.data.find((key: { defaultAppId?: string }) => key.defaultAppId)?.defaultAppId
      ).toBe(defaultAppId.toLowerCase());
      expect((await Call(listKeys, { auth: member })).data).toEqual([]);
    }
  );

  it('validates binding structure after backfill and preserves repaired explicit application keys', async () => {
    const key = await seed({ appId: new Types.ObjectId().toString() });
    const state = createContext();
    state.context.reportProgress.mockImplementation(async ({ key: stage, status }) => {
      if (stage === 'validation' && status === 'running') {
        await MongoOpenApi.collection.updateOne(
          { _id: key._id },
          { $set: { type: 'app', appId: [key.appId] } }
        );
      }
    });
    await expect(backfillOpenApiKeyType(state.context)).rejects.toThrow('incomplete');
    expect(state.failures()).toEqual([
      expect.objectContaining({ stageKey: 'validation', data: { id: String(key._id) } })
    ]);
    state.context.reportProgress.mockReset();
    await MongoOpenApi.collection.updateOne({ _id: key._id }, { $set: { appId: key.appId } });
    await expect(backfillOpenApiKeyType(state.context)).resolves.toEqual({ keys: 1 });
    expect(await MongoOpenApi.collection.findOne({ _id: key._id })).toMatchObject({
      type: 'app',
      appId: new Types.ObjectId(key.appId)
    });
  });

  it('keeps validation failures behind the cursor recoverable until every type is valid', async () => {
    const key = await seed();
    const state = createContext();
    state.context.reportProgress.mockImplementation(async ({ key: stage, status }) => {
      if (stage === 'validation' && status === 'running')
        await MongoOpenApi.collection.updateOne({ _id: key._id }, { $set: { type: null } });
    });
    await expect(backfillOpenApiKeyType(state.context)).rejects.toThrow('incomplete');
    expect(state.failures()).toEqual([
      expect.objectContaining({ stageKey: 'validation', data: { id: String(key._id) } })
    ]);
    expect(state.context.reportProgress).not.toHaveBeenCalledWith({
      key: 'validation',
      status: 'succeeded'
    });
    state.context.reportProgress.mockReset();
    await MongoOpenApi.collection.updateOne({ _id: key._id }, { $unset: { type: 1 } });
    expect(await backfillOpenApiKeyType(state.context)).toEqual({ keys: 1 });
    expect((await MongoOpenApi.collection.findOne({ _id: key._id }))?.type).toBe('personal');
    expect(state.failures()).toEqual([]);
  });
  it('normalizes IDs for every key type while preserving all other fields; replay is idempotent', async () => {
    const records = [];
    for (const appId of [
      undefined,
      null,
      '',
      new Types.ObjectId().toString().toUpperCase(),
      new Types.ObjectId()
    ])
      records.push(await seed(appId === undefined ? {} : { appId }));
    records.push(
      await seed({
        type: 'app',
        appId: new Types.ObjectId().toString(),
        tagIds: [new Types.ObjectId()],
        authProxy: true
      }),
      await seed({ type: 'personal', appId: new Types.ObjectId().toString() }),
      await seed({ type: 'app', appId: new Types.ObjectId() })
    );
    const { context } = createContext();
    expect(await backfillOpenApiKeyType(context)).toEqual({ keys: records.length });
    for (const raw of records) {
      const after = await MongoOpenApi.collection.findOne({ _id: raw._id });
      expect(after).toEqual({
        ...raw,
        type: raw.type ?? 'personal',
        ...(raw.appId ? { appId: new Types.ObjectId(String(raw.appId)) } : {})
      });
    }
    const update = vi.spyOn(MongoOpenApi.collection, 'updateOne');
    try {
      expect(await backfillOpenApiKeyType(createContext().context)).toEqual({
        keys: records.length
      });
      expect(update).not.toHaveBeenCalled();
    } finally {
      update.mockRestore();
    }
  });
  it('rescans the original range when resuming an old type-only checkpoint', async () => {
    const key = await seed({ type: 'personal', appId: new Types.ObjectId().toString() });
    const state = createContext();
    await state.context.saveCheckpoint({
      endId: String(key._id),
      lastId: String(key._id),
      scanned: 1
    });
    expect(await backfillOpenApiKeyType(state.context)).toEqual({ keys: 1 });
    expect((await MongoOpenApi.collection.findOne({ _id: key._id }))?.appId).toEqual(
      new Types.ObjectId(key.appId)
    );
    expect(state.context.saveCheckpoint).toHaveBeenLastCalledWith({
      endId: String(key._id),
      lastId: String(key._id),
      scanned: 1,
      appIdStorageVersion: 1
    });
  });
  it('does not declare success for an ID changed back to a string after scanning, and repairs it on retry', async () => {
    const key = await seed({ type: 'app', appId: new Types.ObjectId() });
    const state = createContext();
    state.context.reportProgress.mockImplementation(async ({ key: stage, status }) => {
      if (stage === 'validation' && status === 'running') {
        await MongoOpenApi.collection.updateOne(
          { _id: key._id },
          { $set: { appId: String(key.appId) } }
        );
      }
    });
    await expect(backfillOpenApiKeyType(state.context)).rejects.toThrow('incomplete');
    expect(state.failures()).toEqual([
      expect.objectContaining({ stageKey: 'validation', data: { id: String(key._id) } })
    ]);
    state.context.reportProgress.mockReset();
    await expect(backfillOpenApiKeyType(state.context)).resolves.toEqual({ keys: 1 });
    expect((await MongoOpenApi.collection.findOne({ _id: key._id }))?.appId).toEqual(key.appId);
    expect(state.failures()).toEqual([]);
  });
  it('replays writes committed before a checkpoint crash and retries repaired failures before the saved cursor', async () => {
    const bad = await seed({ appId: 'invalid' });
    await seed();
    await seed();
    const state = createContext();
    const save = state.context.saveCheckpoint.getMockImplementation()!;
    state.context.saveCheckpoint
      .mockImplementationOnce(save)
      .mockRejectedValueOnce(new Error('crash'));
    await expect(backfillOpenApiKeyType(state.context)).rejects.toThrow('crash');
    state.context.saveCheckpoint.mockImplementation(save);
    await expect(backfillOpenApiKeyType(state.context)).rejects.toThrow('require repair');
    expect(state.failures()).toEqual([
      expect.objectContaining({ data: { id: String(bad._id) }, stageKey: 'keys' })
    ]);
    expect(JSON.stringify(state.failures())).not.toContain('fixture-secret');
    await MongoOpenApi.collection.updateOne({ _id: bad._id }, { $set: { appId: '' } });
    expect(await backfillOpenApiKeyType(state.context)).toEqual({ keys: 3 });
    expect(state.failures()).toEqual([]);
    expect(await MongoOpenApi.countDocuments({ type: 'personal' })).toBe(3);
  });
});

describe('backfillOpenApiKeyTypeRecord', () => {
  it('rejects malformed bindings and unsupported BSON values without changing key types', async () => {
    for (const raw of [
      { type: 'unexpected' },
      { type: 'unexpected', appId: new Types.ObjectId().toString() },
      { type: 'personal', appId: 'invalid' },
      { type: 'app' },
      { appId: [new Types.ObjectId()] },
      { appId: 42 }
    ]) {
      const key = await seed(raw);
      await expect(backfillOpenApiKeyTypeRecord(String(key._id))).rejects.toThrow();
      expect(await MongoOpenApi.collection.findOne({ _id: key._id })).toEqual(key);
    }
  });
  it('CAS miss re-reads the changed binding and never overwrites a concurrent explicit type', async () => {
    const key = await seed();
    const changedAppId = new Types.ObjectId();
    const collection = MongoOpenApi.collection;
    const update = collection.updateOne.bind(collection);
    const spy = vi.spyOn(collection, 'updateOne').mockImplementationOnce(async (...args: any[]) => {
      await update({ _id: key._id }, { $set: { appId: String(changedAppId), type: 'app' } });
      return await update(...(args as Parameters<typeof update>));
    });
    try {
      await backfillOpenApiKeyTypeRecord(String(key._id));
      expect(await collection.findOne({ _id: key._id })).toMatchObject({
        type: 'app',
        appId: changedAppId
      });
    } finally {
      spy.mockRestore();
    }
  });
  it('re-reads explicit bindings on CAS miss and keeps the newer application target', async () => {
    const key = await seed({ type: 'app', appId: new Types.ObjectId().toString() });
    const changedAppId = new Types.ObjectId();
    const collection = MongoOpenApi.collection;
    const update = collection.updateOne.bind(collection);
    const spy = vi.spyOn(collection, 'updateOne').mockImplementationOnce(async (...args: any[]) => {
      await update({ _id: key._id }, { $set: { appId: changedAppId } });
      return update(...(args as Parameters<typeof update>));
    });
    try {
      await backfillOpenApiKeyTypeRecord(String(key._id));
      expect((await collection.findOne({ _id: key._id }))?.appId).toEqual(changedAppId);
    } finally {
      spy.mockRestore();
    }
  });
  it('does not recreate a key deleted during normalization', async () => {
    const key = await seed({ type: 'personal', appId: new Types.ObjectId().toString() });
    const collection = MongoOpenApi.collection;
    const update = collection.updateOne.bind(collection);
    const spy = vi.spyOn(collection, 'updateOne').mockImplementationOnce(async (...args: any[]) => {
      await collection.deleteOne({ _id: key._id });
      return update(...(args as Parameters<typeof update>));
    });
    try {
      await backfillOpenApiKeyTypeRecord(String(key._id));
      expect(await collection.findOne({ _id: key._id })).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
  it('stops after three CAS misses without overwriting the source record', async () => {
    const key = await seed({ type: 'app', appId: new Types.ObjectId().toString() });
    const collection = MongoOpenApi.collection;
    const update = collection.updateOne.bind(collection);
    const missingId = new Types.ObjectId();
    const spy = vi
      .spyOn(collection, 'updateOne')
      .mockImplementation(async (...args: any[]) =>
        update({ ...args[0], _id: missingId }, args[1])
      );
    try {
      await expect(backfillOpenApiKeyTypeRecord(String(key._id))).rejects.toThrow(
        'changed repeatedly'
      );
      expect(spy).toHaveBeenCalledTimes(3);
      expect(await collection.findOne({ _id: key._id })).toEqual(key);
    } finally {
      spy.mockRestore();
    }
  });
});
