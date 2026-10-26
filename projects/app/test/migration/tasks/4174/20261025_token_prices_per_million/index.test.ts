import { describe, expect, it, vi } from 'vitest';
vi.unmock('@fastgpt/service/common/mongo/sessionRun');
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { PriceTypeSchema } from '@fastgpt/global/core/ai/model/schema';
import type { SystemMigrationProgressInput } from '@fastgpt/global/migration/schema';
import { calculateModelPrice } from '@fastgpt/global/core/ai/model/pricing';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { systemMigrations, type SystemMigrationContext } from '@/migration/registry';
import { createSystemMigrationRunner } from '@/migration/runner';
import { MongoSystemMigrationState } from '@/migration/mongoSchema';
import { migrateTokenPricesPerMillion } from '@/migration/tasks/4174/20261025_token_prices_per_million';

const createContext = (initial?: Record<string, unknown>) => {
  let checkpoint = initial;
  const context = {
    migrationId: '20261025_token_prices_per_million',
    runId: 'test',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) => (checkpoint ? schema.parse(checkpoint) : undefined),
    getFailedRecords: vi.fn(async () => {
      throw new Error('blocking task cannot read failures');
    }),
    reportFailedRecords: vi.fn(async () => {
      throw new Error('blocking task cannot write failures');
    }),
    saveCheckpoint: vi.fn(async (value) => {
      checkpoint = structuredClone(value);
    }),
    reportProgress: vi.fn(async (_step: SystemMigrationProgressInput): Promise<void> => {}),
    assertActive: vi.fn(async () => undefined),
    fail: vi.fn(async () => {
      throw new Error('migration failed');
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, checkpoint: () => checkpoint };
};
const base = {
  type: ModelTypeEnum.llm,
  scope: ModelScopeEnum.system,
  provider: 'openai',
  config: {}
};

describe('migrateTokenPricesPerMillion with MongoDB', () => {
  it.each([false, true])(
    'only releases startup after valid prices are migrated, invalid=%s',
    async (invalid) => {
      const migration = systemMigrations.at(-1)!;
      await MongoSystemMigrationState.deleteMany({ _id: migration.id });
      await MongoAIModel.collection.insertOne({
        ...base,
        model: 'startup',
        name: 'Startup',
        charsPointsPrice: invalid ? -1 : 0.125
      });
      const runner = createSystemMigrationRunner({
        migrations: [migration],
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        timing: { blockingPollIntervalMs: 5 }
      });
      let ready = false;
      await runner.start();
      const readiness = runner.waitForBlockingMigrations().then(
        () => {
          ready = true;
          return true;
        },
        () => false
      );
      try {
        if (invalid) {
          await vi.waitFor(async () => {
            expect((await MongoSystemMigrationState.findById(migration.id).lean())?.status).toBe(
              'failed'
            );
          });
          expect(ready).toBe(false);
          expect(await MongoAIModel.collection.findOne({ model: 'startup' })).not.toHaveProperty(
            'legacyTokenPricing'
          );
        } else {
          expect(await readiness).toBe(true);
          expect(await MongoAIModel.collection.findOne({ model: 'startup' })).toMatchObject({
            priceTiers: [{ inputPrice: 125, outputPrice: 125 }]
          });
          expect((await MongoSystemMigrationState.findById(migration.id).lean())?.status).toBe(
            'succeeded'
          );
        }
      } finally {
        runner.stop();
        await runner.tick();
        await readiness;
      }
    }
  );

  it('converts and rounds token prices, preserves backups, and leaves duration prices alone', async () => {
    await MongoAIModel.collection.insertMany([
      {
        ...base,
        model: 'chat',
        name: 'Chat',
        priceTiers: [
          {
            maxInputTokens: 10,
            inputPrice: 2,
            outputPrice: 4
          },
          { inputPrice: 3, outputPrice: 5 }
        ]
      },
      {
        ...base,
        model: 'embedding',
        name: 'Embedding',
        type: ModelTypeEnum.embedding,
        charsPointsPrice: 0.5
      },
      { ...base, model: 'tts', name: 'TTS', type: ModelTypeEnum.tts, charsPointsPrice: 0.125 },
      {
        ...base,
        model: 'rerank',
        name: 'Rerank',
        type: ModelTypeEnum.rerank,
        charsPointsPrice: 0.000125
      },
      { ...base, model: 'stt', name: 'STT', type: ModelTypeEnum.stt, charsPointsPrice: 0.125 },
      {
        ...base,
        model: 'tts-m',
        name: 'TTS M',
        type: ModelTypeEnum.tts,
        legacyTokenPricing: { charsPointsPrice: 0.000125 },
        charsPointsPrice: 0.13
      }
    ]);
    const original = await MongoAIModel.collection.findOne({ model: 'chat' });
    const originalSTT = await MongoAIModel.collection.findOne({ model: 'stt' });
    const currentTTS = await MongoAIModel.collection.findOne({ model: 'tts-m' });
    const first = createContext();
    expect(await migrateTokenPricesPerMillion(first.context)).toEqual({ verifiedCount: 6 });
    const migrated = await MongoAIModel.collection.findOne({ model: 'chat' });
    expect(migrated).toMatchObject({
      priceTiers: [
        {
          maxInputTokens: 0.01,
          inputPrice: 2000,
          outputPrice: 4000
        },
        { inputPrice: 3000, outputPrice: 5000 }
      ],
      legacyTokenPricing: { priceTiers: original!.priceTiers }
    });
    for (const inputTokens of [10000, 10001]) {
      const usage = {
        inputTokens,
        outputTokens: 2000
      };
      expect(
        calculateModelPrice({
          config: { ...PriceTypeSchema.parse(migrated), type: ModelTypeEnum.llm },
          ...usage
        }).totalPoints
      ).toBeCloseTo(inputTokens === 10000 ? 28 : 40.003, 12);
    }
    expect(await MongoAIModel.collection.findOne({ model: 'embedding' })).toMatchObject({
      charsPointsPrice: 500
    });
    const migratedTTS = await MongoAIModel.collection.findOne({ model: 'tts' });
    expect(migratedTTS).toMatchObject({
      charsPointsPrice: 125,
      legacyTokenPricing: { charsPointsPrice: 0.125 }
    });
    expect(
      calculateModelPrice({
        config: { ...PriceTypeSchema.parse(migratedTTS), type: ModelTypeEnum.tts },
        inputTokens: 1000000
      }).totalPoints
    ).toBe(125);
    expect(await MongoAIModel.collection.findOne({ model: 'rerank' })).toMatchObject({
      charsPointsPrice: 0.13,
      legacyTokenPricing: { charsPointsPrice: 0.000125 }
    });
    expect(await MongoAIModel.collection.findOne({ model: 'stt' })).toEqual(originalSTT);
    expect(await MongoAIModel.collection.findOne({ model: 'tts-m' })).toEqual(currentTTS);
    expect(first.context.getFailedRecords).not.toHaveBeenCalled();
    expect(first.context.reportFailedRecords).not.toHaveBeenCalled();
    const again = createContext(first.checkpoint());
    await migrateTokenPricesPerMillion(again.context);
    expect(await MongoAIModel.collection.findOne({ model: 'chat' })).toEqual(migrated);
    expect(await MongoAIModel.collection.findOne({ model: 'tts' })).toEqual(migratedTTS);
    // 管理员已调整的新单价不能被重放再放大或由旧备份覆盖。
    await MongoAIModel.collection.updateOne({ model: 'tts' }, { $set: { charsPointsPrice: 150 } });
    await migrateTokenPricesPerMillion(createContext().context);
    expect(await MongoAIModel.collection.findOne({ model: 'tts' })).toMatchObject({
      charsPointsPrice: 150,
      legacyTokenPricing: { charsPointsPrice: 0.125 }
    });
    expect(
      first.context.reportProgress.mock.calls.map(([step]) => `${step.key}:${step.status}`)
    ).toEqual([
      'models:running',
      'models:running',
      'models:succeeded',
      'validation:running',
      'validation:running',
      'validation:succeeded'
    ]);
  });

  it.each(['repair', 'delete'])(
    'blocks on malformed prices without advancing the batch, then resumes after %s',
    async (action) => {
      const { insertedId } = await MongoAIModel.collection.insertOne({
        ...base,
        model: 'bad',
        name: 'Bad',
        inputPrice: -1,
        outputPrice: 2
      });
      const first = createContext();
      await expect(migrateTokenPricesPerMillion(first.context)).rejects.toThrow(
        'Negative model price'
      );
      expect(await MongoAIModel.collection.findOne({ _id: insertedId })).not.toHaveProperty(
        'legacyTokenPricing'
      );
      expect(first.checkpoint()).toMatchObject({ lastId: null, scannedCount: 0 });
      expect(first.context.logger.error).toHaveBeenCalledWith(
        'Model pricing migration requires source repair',
        { errorCount: 1, modelId: String(insertedId), reason: 'Negative model price' }
      );
      expect(first.context.getFailedRecords).not.toHaveBeenCalled();
      expect(first.context.reportFailedRecords).not.toHaveBeenCalled();
      if (action === 'repair')
        await MongoAIModel.collection.updateOne({ _id: insertedId }, { $set: { inputPrice: 1 } });
      else await MongoAIModel.collection.deleteOne({ _id: insertedId });
      const resumed = createContext(first.checkpoint());
      await expect(migrateTokenPricesPerMillion(resumed.context)).resolves.toEqual({
        verifiedCount: action === 'repair' ? 1 : 0
      });
      if (action === 'repair')
        expect(await MongoAIModel.collection.findOne({ _id: insertedId })).toMatchObject({
          inputPrice: 1000,
          outputPrice: 2000
        });
      else expect(await MongoAIModel.collection.findOne({ _id: insertedId })).toBeNull();
    }
  );

  it('resets its checkpoint when final validation finds a missed source row, then repairs it on restart', async () => {
    await MongoAIModel.collection.insertOne({
      ...base,
      model: 'first',
      name: 'First',
      inputPrice: 1
    });
    const first = createContext();
    first.context.reportProgress.mockImplementation(async (step) => {
      if (step.key === 'models' && step.status === 'succeeded') {
        await MongoAIModel.collection.insertOne({
          ...base,
          model: 'late',
          name: 'Late',
          inputPrice: 2
        });
      }
    });
    await expect(migrateTokenPricesPerMillion(first.context)).rejects.toThrow(
      'has not been converted'
    );
    expect(first.checkpoint()).toMatchObject({ lastId: null, scannedCount: 0 });
    await expect(
      migrateTokenPricesPerMillion(createContext(first.checkpoint()).context)
    ).resolves.toEqual({ verifiedCount: 2 });
    expect(await MongoAIModel.collection.findOne({ model: 'first' })).toMatchObject({
      inputPrice: 1000
    });
    expect(await MongoAIModel.collection.findOne({ model: 'late' })).toMatchObject({
      inputPrice: 2000
    });
  });

  it('safely replays a batch after its transaction committed but its checkpoint failed', async () => {
    await MongoAIModel.collection.insertOne({
      ...base,
      model: 'replay',
      name: 'Replay',
      charsPointsPrice: 0.25
    });
    const first = createContext();
    first.context.saveCheckpoint
      .mockImplementationOnce(async () => undefined)
      .mockRejectedValueOnce(new Error('checkpoint unavailable'));
    await expect(migrateTokenPricesPerMillion(first.context)).rejects.toThrow(
      'checkpoint unavailable'
    );
    const committed = await MongoAIModel.collection.findOne({ model: 'replay' });
    expect(committed).toMatchObject({
      legacyTokenPricing: { charsPointsPrice: 0.25 },
      charsPointsPrice: 250
    });
    await migrateTokenPricesPerMillion(createContext().context);
    expect(await MongoAIModel.collection.findOne({ model: 'replay' })).toEqual(committed);
  });

  it('does not revive a stale comprehensive price when tiny legacy IO prices round to free', async () => {
    await MongoAIModel.collection.insertOne({
      ...base,
      model: 'tiny',
      name: 'Tiny',
      priceTiers: [],
      inputPrice: 0.0000005,
      outputPrice: 0.0000005,
      charsPointsPrice: 9
    });
    await migrateTokenPricesPerMillion(createContext().context);
    const saved = await MongoAIModel.collection.findOne({ model: 'tiny' });
    expect(saved).toMatchObject({
      priceTiers: [{ inputPrice: 0, outputPrice: 0 }]
    });
    expect(
      calculateModelPrice({
        config: { ...PriceTypeSchema.parse(saved), type: ModelTypeEnum.llm },
        inputTokens: 1000
      }).totalPoints
    ).toBe(0);
  });

  it.each([
    { endId: null, lastId: '507f1f77bcf86cd799439012' },
    { endId: '507f1f77bcf86cd799439011', lastId: '507f1f77bcf86cd799439012' }
  ])('rejects an invalid resume cursor before business writes: %j', async (cursor) => {
    const context = createContext({ version: 1, scannedCount: 0, total: 0, ...cursor });
    await expect(migrateTokenPricesPerMillion(context.context)).rejects.toThrow();
    expect(context.context.saveCheckpoint).not.toHaveBeenCalled();
  });

  it('completes empty databases and stops before writes when its lease is lost', async () => {
    const empty = createContext();
    await expect(migrateTokenPricesPerMillion(empty.context)).resolves.toEqual({
      verifiedCount: 0
    });
    await MongoAIModel.collection.insertOne({
      ...base,
      model: 'lease',
      name: 'Lease',
      inputPrice: 1
    });
    const lost = createContext();
    lost.context.assertActive
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('lease lost'));
    await expect(migrateTokenPricesPerMillion(lost.context)).rejects.toThrow('lease lost');
    expect(await MongoAIModel.collection.findOne({ model: 'lease' })).not.toHaveProperty(
      'legacyTokenPricing'
    );
  });
});
