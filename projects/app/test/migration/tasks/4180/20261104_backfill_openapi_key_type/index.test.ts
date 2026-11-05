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
  it('classifies legacy keys without changing credentials, metadata or explicit types; replay is idempotent', async () => {
    const records = [];
    for (const appId of [undefined, null, '', new Types.ObjectId().toString()])
      records.push(await seed(appId === undefined ? {} : { appId }));
    records.push(
      await seed({
        type: 'app',
        appId: new Types.ObjectId().toString(),
        tagIds: [new Types.ObjectId()],
        authProxy: true
      })
    );
    const { context } = createContext();
    expect(await backfillOpenApiKeyType(context)).toEqual({ keys: 5 });
    for (const raw of records) {
      const after = await MongoOpenApi.collection.findOne({ _id: raw._id });
      expect(after?.type).toBe(raw.appId ? 'app' : 'personal');
      expect({ ...after, type: undefined }).toEqual({ ...raw, type: undefined });
    }
    expect(await backfillOpenApiKeyType(context)).toEqual({ keys: 5 });
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
  it('reports malformed explicit bindings and non-string appId without degrading them to personal', async () => {
    for (const raw of [
      { type: 'unexpected' },
      { type: 'personal', appId: new Types.ObjectId().toString() },
      { type: 'app' },
      { appId: new Types.ObjectId() },
      { appId: 42 }
    ]) {
      const key = await seed(raw);
      await expect(backfillOpenApiKeyTypeRecord(String(key._id))).rejects.toThrow();
      expect(await MongoOpenApi.collection.findOne({ _id: key._id })).toEqual(key);
    }
  });
  it('CAS miss re-reads the changed binding and never overwrites a concurrent explicit type', async () => {
    const key = await seed();
    const collection = MongoOpenApi.collection;
    const update = collection.updateOne.bind(collection);
    const spy = vi.spyOn(collection, 'updateOne').mockImplementationOnce(async (...args: any[]) => {
      await update(
        { _id: key._id },
        { $set: { appId: new Types.ObjectId().toString(), type: 'app' } }
      );
      return await update(...(args as Parameters<typeof update>));
    });
    try {
      await backfillOpenApiKeyTypeRecord(String(key._id));
      expect((await collection.findOne({ _id: key._id }))?.type).toBe('app');
    } finally {
      spy.mockRestore();
    }
  });
});
