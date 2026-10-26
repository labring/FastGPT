import { afterEach, describe, expect, it, vi } from 'vitest';
vi.unmock('@fastgpt/service/common/mongo/sessionRun');
import { Types } from '@fastgpt/service/common/mongo';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { PriceTypeSchema } from '@fastgpt/global/core/ai/model/schema';
import type {
  SystemMigrationFailureInput,
  SystemMigrationProgressInput
} from '@fastgpt/global/migration/schema';
import { calculateModelPrice } from '@fastgpt/global/core/ai/model/pricing';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import type { SystemMigrationContext } from '@/migration/registry';
import { migrateTokenPricesPerMillion } from '@/migration/tasks/4174/20261025_token_prices_per_million';

const createContext = () =>
  ({
    migrationId: '20261025_token_prices_per_million',
    runId: 'test',
    signal: new AbortController().signal,
    getCheckpoint: vi.fn(async () => undefined),
    saveCheckpoint: vi.fn(async () => undefined),
    getFailedRecords: vi.fn(async () => []),
    reportFailedRecords: vi.fn(async () => undefined),
    reportProgress: vi.fn(async (_step: SystemMigrationProgressInput) => undefined),
    assertActive: vi.fn(async () => undefined),
    fail: vi.fn(async (input: SystemMigrationFailureInput): Promise<never> => {
      throw new Error(input.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  }) satisfies SystemMigrationContext;
const base = {
  type: ModelTypeEnum.llm,
  scope: ModelScopeEnum.system,
  provider: 'openai',
  config: {}
};
afterEach(() => vi.restoreAllMocks());

describe('migrateTokenPricesPerMillion', () => {
  it('reads system models once and saves all converted prices in one bulk write', async () => {
    const cases = [
      {
        model: 'tiers',
        type: ModelTypeEnum.llm,
        legacy: {
          priceTiers: [
            { minInputTokens: 0, maxInputTokens: 4.1, inputPrice: 1, outputPrice: 0 },
            { minInputTokens: 4.1, inputPrice: 3, outputPrice: 0 }
          ]
        },
        expected: {
          tiers: [
            { maxInputTokens: 0.0041, inputPrice: 1000, outputPrice: 0 },
            { inputPrice: 3000, outputPrice: 0 }
          ]
        }
      },
      {
        model: 'io',
        type: ModelTypeEnum.llm,
        legacy: { inputPrice: 0.000035, outputPrice: 0.000065 },
        expected: { tiers: [{ inputPrice: 0.04, outputPrice: 0.07 }] }
      },
      {
        model: 'comprehensive',
        type: ModelTypeEnum.llm,
        legacy: { charsPointsPrice: 0.125 },
        expected: { tiers: [{ inputPrice: 125, outputPrice: 125 }] }
      },
      {
        model: 'embedding',
        type: ModelTypeEnum.embedding,
        legacy: { charsPointsPrice: 0.5 },
        expected: { unitPrice: 500 }
      },
      {
        model: 'rerank',
        type: ModelTypeEnum.rerank,
        legacy: { charsPointsPrice: 0.000035 },
        expected: { unitPrice: 0.04 }
      },
      {
        model: 'tts',
        type: ModelTypeEnum.tts,
        legacy: { charsPointsPrice: 0.000065 },
        expected: { unitPrice: 0.07 }
      },
      {
        model: 'stt',
        type: ModelTypeEnum.stt,
        legacy: { charsPointsPrice: 0.125 },
        expected: { unitPrice: 0.125 }
      },
      {
        model: 'free',
        type: ModelTypeEnum.llm,
        legacy: {
          priceTiers: [],
          inputPrice: 0.0000005,
          outputPrice: 0.0000005,
          charsPointsPrice: 9
        },
        expected: { tiers: [{ inputPrice: 0, outputPrice: 0 }] }
      }
    ];
    await MongoAIModel.collection.insertMany([
      ...cases.map(({ model, type, legacy }) => ({
        ...base,
        model,
        name: model,
        type,
        isActive: false,
        ...legacy
      })),
      {
        ...base,
        model: 'team',
        name: 'Team',
        scope: ModelScopeEnum.team,
        teamId: new Types.ObjectId(),
        charsPointsPrice: 0.25
      },
      { ...base, model: 'configured-empty', name: 'Empty', charsPointsPrice: 10, pricing: {} },
      {
        ...base,
        model: 'configured-zero',
        name: 'Zero',
        type: ModelTypeEnum.stt,
        charsPointsPrice: 10,
        pricing: { unitPrice: 0 }
      },
      {
        ...base,
        model: 'converted',
        name: 'Converted',
        charsPointsPrice: 123,
        pricing: { tiers: [{ inputPrice: 12, outputPrice: 24 }] }
      }
    ]);
    const unchanged = await MongoAIModel.collection
      .find({ model: { $in: ['team', 'converted', 'configured-empty', 'configured-zero'] } })
      .toArray();
    const read = vi.spyOn(MongoAIModel.collection, 'find');
    const write = vi.spyOn(MongoAIModel.collection, 'bulkWrite');
    const context = createContext();
    await expect(migrateTokenPricesPerMillion(context)).resolves.toEqual({
      migratedCount: cases.length
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toHaveLength(cases.length);
    for (const { model, legacy, expected } of cases) {
      expect(await MongoAIModel.collection.findOne({ model })).toMatchObject({
        ...legacy,
        pricing: expected
      });
    }
    const tierModel = await MongoAIModel.collection.findOne({ model: 'tiers' });
    expect(
      [4099, 4100, 4101].map(
        (inputTokens) =>
          calculateModelPrice({
            config: {
              ...PriceTypeSchema.parse(tierModel),
              type: ModelTypeEnum.llm,
              scope: ModelScopeEnum.system
            },
            inputTokens
          }).totalPoints
      )
    ).toEqual([4.099, 4.1, 12.303]);
    expect(
      calculateModelPrice({
        config: {
          ...PriceTypeSchema.parse(await MongoAIModel.collection.findOne({ model: 'free' })),
          type: ModelTypeEnum.llm,
          scope: ModelScopeEnum.system
        },
        inputTokens: 1000000
      }).totalPoints
    ).toBe(0);
    for (const record of unchanged)
      expect(await MongoAIModel.collection.findOne({ _id: record._id })).toEqual(record);
    expect(
      await MongoAIModelCatalog.findOne({ scope: ModelScopeEnum.system }).lean()
    ).toMatchObject({ catalogRevision: 1 });
    expect(await MongoAIModelCatalog.findOne({ scope: ModelScopeEnum.team }).lean()).toBeNull();

    await MongoAIModel.collection.updateOne(
      { model: 'embedding' },
      { $set: { 'pricing.unitPrice': 1700 } }
    );
    write.mockClear();
    await expect(migrateTokenPricesPerMillion(createContext())).resolves.toEqual({
      migratedCount: 0
    });
    expect(write).not.toHaveBeenCalled();
    expect(await MongoAIModel.collection.findOne({ model: 'embedding' })).toMatchObject({
      pricing: { unitPrice: 1700 }
    });
    expect(context.getCheckpoint).not.toHaveBeenCalled();
    expect(context.saveCheckpoint).not.toHaveBeenCalled();
    expect(context.getFailedRecords).not.toHaveBeenCalled();
  });

  it.each([
    { inputPrice: -1 },
    { inputPrice: NaN },
    { inputPrice: Number.MAX_VALUE },
    { pricing: null },
    { pricing: { unitPrice: -1 } },
    { pricing: { tiers: [{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }] } }
  ])('rejects invalid or overflowing source prices before any write: %s', async (invalid) => {
    await MongoAIModel.collection.insertMany([
      { ...base, model: 'valid', name: 'Valid', inputPrice: 1 },
      { ...base, model: 'invalid', name: 'Invalid', ...invalid }
    ]);
    const write = vi.spyOn(MongoAIModel.collection, 'bulkWrite');
    await expect(migrateTokenPricesPerMillion(createContext())).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
    expect(
      await MongoAIModel.collection.countDocuments({ model: 'valid', pricing: { $exists: true } })
    ).toBe(0);
  });

  it('rolls back the single bulk write if updating the catalog revision fails, then safely retries', async () => {
    await MongoAIModel.collection.insertOne({
      ...base,
      model: 'rollback',
      name: 'Rollback',
      inputPrice: 1
    });
    const revision = vi
      .spyOn(MongoAIModelCatalog, 'updateOne')
      .mockRejectedValueOnce(new Error('revision unavailable'));
    await expect(migrateTokenPricesPerMillion(createContext())).rejects.toThrow(
      'revision unavailable'
    );
    expect(await MongoAIModel.collection.findOne({ model: 'rollback' })).toMatchObject({
      inputPrice: 1
    });
    expect(await MongoAIModel.collection.findOne({ model: 'rollback' })).not.toHaveProperty(
      'pricing'
    );
    revision.mockRestore();
    await expect(migrateTokenPricesPerMillion(createContext())).resolves.toEqual({
      migratedCount: 1
    });
  });

  it('does not overwrite an admin price saved between reading and bulk writing', async () => {
    await MongoAIModel.collection.insertOne({
      ...base,
      model: 'concurrent',
      name: 'Concurrent',
      inputPrice: 1
    });
    const bulkWrite = MongoAIModel.collection.bulkWrite.bind(MongoAIModel.collection);
    const write = vi
      .spyOn(MongoAIModel.collection, 'bulkWrite')
      .mockImplementationOnce(async (operations, options) => {
        await MongoAIModel.collection.updateOne(
          { model: 'concurrent' },
          { $set: { pricing: { tiers: [] } } }
        );
        return bulkWrite(operations, options);
      });
    await expect(migrateTokenPricesPerMillion(createContext())).resolves.toEqual({
      migratedCount: 0
    });
    expect(write).toHaveBeenCalledOnce();
    expect(await MongoAIModel.collection.findOne({ model: 'concurrent' })).toMatchObject({
      inputPrice: 1,
      pricing: { tiers: [] }
    });
  });

  it('completes an empty system catalog without writing', async () => {
    const write = vi.spyOn(MongoAIModel.collection, 'bulkWrite');
    await expect(migrateTokenPricesPerMillion(createContext())).resolves.toEqual({
      migratedCount: 0
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('does not write after losing its lease', async () => {
    await MongoAIModel.collection.insertOne({
      ...base,
      model: 'lease',
      name: 'Lease',
      inputPrice: 1
    });
    const context = createContext();
    context.assertActive
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('lease lost'));
    await expect(migrateTokenPricesPerMillion(context)).rejects.toThrow('lease lost');
    expect(await MongoAIModel.collection.findOne({ model: 'lease' })).not.toHaveProperty('pricing');
  });
});
