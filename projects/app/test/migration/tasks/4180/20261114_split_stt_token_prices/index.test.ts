import { describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import { splitSTTTokenPrices } from '@/migration/tasks/4180/20261114_split_stt_token_prices';
import type { SystemMigrationContext } from '@/migration/registry';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';
vi.unmock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@/migration/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/migration/constants')>()),
  systemMigrationBatchSize: 2
}));
/** 仅模拟升级框架的持久恢复状态；业务记录读写使用真实隔离 Mongo。 */
const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  let failures: SystemMigrationFailedRecord[] = [];
  const context = {
    migrationId: '20261114_split_stt_token_prices',
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
  const _id = new Types.ObjectId();
  const raw = {
    _id,
    type: 'stt',
    scope: 'system',
    model: `stt-${_id}`,
    name: 'STT',
    provider: 'openai',
    config: {},
    requestAuth: 'fixture-secret',
    pricing: { type: 'tokens', unitPrice: 0.2 },
    ...overrides
  };
  await MongoAIModel.collection.insertOne(raw as any);
  return raw;
};

describe('splitSTTTokenPrices', () => {
  it('splits old system/team rates and explicit zero, preserving partial new configurations and other model types', async () => {
    const records = [];
    for (const unitPrice of [0, 0.2, 10])
      records.push(await seed({ pricing: { type: 'tokens', unitPrice } }));
    records.push(
      await seed({
        scope: 'team',
        teamId: new Types.ObjectId(),
        pricing: { type: 'tokens', unitPrice: 3 }
      })
    );
    const configured = await seed({ pricing: { type: 'tokens', inputPrice: 0.8 } });
    const duration = await seed({ pricing: { type: 'duration', unitPrice: 0.2 } });
    const other = await seed({ type: 'embedding', pricing: { unitPrice: 1 } });
    const state = createContext();
    expect(await splitSTTTokenPrices(state.context)).toEqual({ models: 5 });
    for (const raw of records) {
      const unitPrice = (raw.pricing as { unitPrice: number }).unitPrice;
      expect(await MongoAIModel.collection.findOne({ _id: raw._id })).toEqual({
        ...raw,
        pricing: { ...raw.pricing, inputPrice: unitPrice, outputPrice: unitPrice }
      });
    }
    for (const raw of [configured, duration, other])
      expect(await MongoAIModel.collection.findOne({ _id: raw._id })).toEqual(raw);
    const catalogs = await MongoAIModelCatalog.find({}).lean();
    expect(await splitSTTTokenPrices(createContext().context)).toEqual({ models: 5 });
    expect(await MongoAIModelCatalog.find({}).lean()).toEqual(catalogs);
    expect(
      state.context.reportProgress.mock.calls.map(([value]) => [value.key, value.status])
    ).toEqual([
      ['models', 'running'],
      ['models', 'running'],
      ['models', 'running'],
      ['models', 'running'],
      ['models', 'succeeded'],
      ['validation', 'running'],
      ['validation', 'succeeded']
    ]);
  });
  it('reports only IDs, persists errors before the cursor and retries repaired records behind it', async () => {
    const bad = await seed({ pricing: { type: 'tokens', unitPrice: -1 } });
    const good = await seed();
    const state = createContext();
    await expect(splitSTTTokenPrices(state.context)).rejects.toThrow('require repair');
    expect((await MongoAIModel.collection.findOne({ _id: good._id }))?.pricing).toMatchObject({
      inputPrice: 0.2,
      outputPrice: 0.2
    });
    expect(state.failures()).toEqual([
      expect.objectContaining({ stageKey: 'models', data: { id: String(bad._id) } })
    ]);
    expect(JSON.stringify(state.failures())).not.toContain('fixture-secret');
    const errorsOrder = state.context.reportFailedRecords.mock.invocationCallOrder.at(-1)!;
    const checkpointOrder = state.context.saveCheckpoint.mock.invocationCallOrder.at(-1)!;
    expect(errorsOrder).toBeLessThan(checkpointOrder);
    await MongoAIModel.collection.updateOne({ _id: bad._id }, { $set: { 'pricing.unitPrice': 0 } });
    expect(await splitSTTTokenPrices(state.context)).toEqual({ models: 2 });
    expect(state.failures()).toEqual([]);
  });
  it('replays committed batches after a checkpoint crash without overwriting prices', async () => {
    for (let i = 0; i < 3; i++) await seed();
    const state = createContext();
    const save = state.context.saveCheckpoint.getMockImplementation()!;
    state.context.saveCheckpoint
      .mockImplementationOnce(save)
      .mockRejectedValueOnce(new Error('checkpoint crash'));
    await expect(splitSTTTokenPrices(state.context)).rejects.toThrow('checkpoint crash');
    state.context.saveCheckpoint.mockImplementation(save);
    expect(await splitSTTTokenPrices(state.context)).toEqual({ models: 3 });
    expect(
      await MongoAIModel.countDocuments({ 'pricing.inputPrice': 0.2, 'pricing.outputPrice': 0.2 })
    ).toBe(3);
  });
  it('validates the whole token catalog and recovers validation failures behind the scan cursor', async () => {
    const raw = await seed();
    const state = createContext();
    state.context.reportProgress.mockImplementation(async ({ key, status }) => {
      if (key === 'validation' && status === 'running')
        await MongoAIModel.collection.updateOne(
          { _id: raw._id },
          { $unset: { 'pricing.inputPrice': 1, 'pricing.outputPrice': 1 } }
        );
    });
    await expect(splitSTTTokenPrices(state.context)).rejects.toThrow('incomplete');
    expect(state.failures()[0]).toMatchObject({
      stageKey: 'validation',
      data: { id: String(raw._id) }
    });
    state.context.reportProgress.mockReset();
    expect(await splitSTTTokenPrices(state.context)).toEqual({ models: 1 });
    expect(state.failures()).toEqual([]);
  });
  it('handles empty catalogs and stops before writes after lease loss', async () => {
    expect(await splitSTTTokenPrices(createContext().context)).toEqual({ models: 0 });
    const raw = await seed();
    const state = createContext();
    state.context.assertActive.mockRejectedValueOnce(new Error('lease lost'));
    await expect(splitSTTTokenPrices(state.context)).rejects.toThrow('lease lost');
    expect(await MongoAIModel.collection.findOne({ _id: raw._id })).toEqual(raw);
  });
});
