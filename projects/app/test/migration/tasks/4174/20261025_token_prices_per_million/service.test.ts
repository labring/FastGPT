import { afterEach, describe, expect, it, vi } from 'vitest';
// 默认测试环境简化事务；迁移必须执行真实事务以验证回滚和目录修订号的原子性。
vi.unmock('@fastgpt/service/common/mongo/sessionRun');
import { Types } from '@fastgpt/service/common/mongo';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { calculateModelPrice } from '@fastgpt/global/core/ai/model/pricing';
import { PriceTypeSchema } from '@fastgpt/global/core/ai/model/schema';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { formatDbModelToRuntimeModel } from '@fastgpt/service/core/ai/model/runtime';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import {
  getTokenPriceMigrationSnapshot,
  readTokenPriceMigrationBatch,
  migrateTokenPricesBatch,
  validateTokenPricesBatch,
  type TokenPriceMigrationRecord
} from '@/migration/tasks/4174/20261025_token_prices_per_million/service';

const base = {
  type: ModelTypeEnum.llm,
  scope: ModelScopeEnum.system,
  provider: 'openai',
  config: {}
};
afterEach(() => vi.restoreAllMocks());
const readAll = async () =>
  readTokenPriceMigrationBatch({ ...(await getTokenPriceMigrationSnapshot()), limit: 100 });

describe('migrateTokenPricesBatch', () => {
  it.each([
    [0.000035, 0.04],
    [0.000065, 0.07]
  ])(
    'persists decimal midpoint %s as %s and replays it without changing the fee',
    async (source, expected) => {
      await MongoAIModel.collection.insertMany([
        {
          ...base,
          model: 'midpoint-tiers',
          name: 'Midpoint tiers',
          priceTiers: [{ inputPrice: source, outputPrice: source }]
        },
        ...[
          ModelTypeEnum.llm,
          ModelTypeEnum.embedding,
          ModelTypeEnum.rerank,
          ModelTypeEnum.tts
        ].map((type) => ({
          ...base,
          type,
          model: `midpoint-${type}`,
          name: `Midpoint ${type}`,
          charsPointsPrice: source
        })),
        {
          ...base,
          model: 'midpoint-io',
          name: 'Midpoint IO',
          inputPrice: source,
          outputPrice: source
        }
      ]);
      const original = await readAll();
      await expect(migrateTokenPricesBatch(original)).resolves.toEqual({ errors: [] });
      const saved = await readAll();
      for (const record of saved) {
        const tiers = record.priceTiers;
        if (tiers) expect(tiers).toMatchObject([{ inputPrice: expected, outputPrice: expected }]);
        if (record.charsPointsPrice !== undefined) expect(record.charsPointsPrice).toBe(expected);
        if (record.inputPrice !== undefined) expect(record.inputPrice).toBe(expected);
        if (record.outputPrice !== undefined) expect(record.outputPrice).toBe(expected);
        expect(calculateModelPrice({ config: record, inputTokens: 1000000 }).totalPoints).toBe(
          expected
        );
        expect(record.legacyTokenPricing).toEqual(
          PriceTypeSchema.parse(original.find(({ _id }) => String(_id) === String(record._id)))
        );
      }
      await expect(migrateTokenPricesBatch(saved)).resolves.toEqual({ errors: [] });
      expect(await readAll()).toEqual(saved);
    }
  );

  it('preserves decimal tier boundaries through MongoDB migration and runtime billing', async () => {
    const { insertedId } = await MongoAIModel.collection.insertOne({
      ...base,
      model: 'decimal-tier-boundary',
      name: 'Decimal tier boundary',
      config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 },
      priceTiers: [
        { minInputTokens: 0, maxInputTokens: 4.1, inputPrice: 1, outputPrice: 0 },
        { minInputTokens: 4.1, inputPrice: 3, outputPrice: 0 }
      ]
    });
    await expect(migrateTokenPricesBatch(await readAll())).resolves.toEqual({ errors: [] });
    const saved = await MongoAIModel.collection.findOne({ _id: insertedId });
    const model = formatDbModelToRuntimeModel(saved!, { fallbackProvider: true });
    // 三个期望值来自迁移前每千单价：4100 tokens 仍属于第一档的右闭边界。
    for (const [inputTokens, totalPoints] of [
      [4099, 4.099],
      [4100, 4.1],
      [4101, 12.303]
    ]) {
      expect(calculateModelPrice({ config: model, inputTokens }).totalPoints).toBe(totalPoints);
    }
    expect(saved?.legacyTokenPricing?.priceTiers?.[0].maxInputTokens).toBe(4.1);
  });

  it('uses source-value CAS and rolls the batch back when a model was edited concurrently', async () => {
    await MongoAIModel.collection.insertMany([
      { ...base, model: 'a', name: 'A', inputPrice: 1 },
      { ...base, model: 'b', name: 'B', inputPrice: 2 }
    ]);
    const records = await readAll();
    await MongoAIModel.collection.updateOne({ model: 'b' }, { $set: { inputPrice: 3 } });
    await expect(migrateTokenPricesBatch(records)).rejects.toThrow('changed concurrently');
    expect(await MongoAIModel.collection.findOne({ model: 'a' })).not.toHaveProperty(
      'legacyTokenPricing'
    );
    expect(await MongoAIModel.collection.findOne({ model: 'b' })).toMatchObject({ inputPrice: 3 });
  });

  it('rolls back converted prices when catalog revision writing fails, then refreshes both scopes', async () => {
    const teamId = new Types.ObjectId();
    await MongoAIModel.collection.insertMany([
      { ...base, model: 'system', name: 'System', inputPrice: 1, teamId: null },
      { ...base, model: 'team', name: 'Team', scope: ModelScopeEnum.team, teamId, inputPrice: 2 }
    ]);
    const records = await readAll();
    const failure = vi
      .spyOn(MongoAIModelCatalog, 'updateOne')
      .mockRejectedValueOnce(new Error('revision unavailable'));
    await expect(migrateTokenPricesBatch(records)).rejects.toThrow('revision unavailable');
    expect(
      await MongoAIModel.collection.countDocuments({ legacyTokenPricing: { $exists: true } })
    ).toBe(0);
    failure.mockRestore();
    const verification = vi
      .spyOn(MongoAIModel.collection, 'find')
      .mockReturnValueOnce({ toArray: async () => [] } as never);
    await expect(migrateTokenPricesBatch(records)).rejects.toThrow('verification failed');
    verification.mockRestore();
    expect(
      await MongoAIModel.collection.countDocuments({ legacyTokenPricing: { $exists: true } })
    ).toBe(0);
    await expect(migrateTokenPricesBatch(records)).resolves.toEqual({ errors: [] });
    expect(
      await MongoAIModelCatalog.findOne({ scope: ModelScopeEnum.system }).lean()
    ).toMatchObject({ catalogRevision: 1 });
    expect(
      await MongoAIModelCatalog.findOne({ scope: ModelScopeEnum.team, teamId }).lean()
    ).toMatchObject({ catalogRevision: 1 });
  });

  it('reports malformed, invalid-scope, negative and overflowing prices without writing them', async () => {
    const invalid = [
      { type: 'legacy-unknown' as ModelTypeEnum },
      { inputPrice: NaN },
      { legacyTokenPricing: null },
      { scope: ModelScopeEnum.team },
      { inputPrice: -1 },
      { inputPrice: Number.MAX_VALUE },
      { priceTiers: [{ inputPrice: null, outputPrice: 2 }] }
    ].map((data) => ({
      ...base,
      _id: new Types.ObjectId(),
      ...data
    })) as TokenPriceMigrationRecord[];
    await MongoAIModel.collection.insertOne({
      ...base,
      model: 'valid',
      name: 'Valid',
      inputPrice: 1
    });
    const valid = await readAll();
    expect((await migrateTokenPricesBatch([...valid, ...invalid])).errors).toHaveLength(
      invalid.length
    );
    expect(await MongoAIModel.collection.findOne({ model: 'valid' })).not.toHaveProperty(
      'legacyTokenPricing'
    );
    expect(validateTokenPricesBatch(invalid)).toHaveLength(invalid.length);
    expect(validateTokenPricesBatch([{ ...base, _id: new Types.ObjectId() }])).toEqual([
      expect.objectContaining({ reason: 'Model token price has not been converted' })
    ]);
    expect(
      validateTokenPricesBatch([{ ...base, _id: new Types.ObjectId(), legacyTokenPricing: {} }])
    ).toEqual([]);
  });
});
