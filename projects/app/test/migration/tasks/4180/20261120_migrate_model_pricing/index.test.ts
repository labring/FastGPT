import { describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { calculateModelPrice } from '@fastgpt/global/core/ai/model/pricing';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { formatDbModelToRuntimeModel } from '@fastgpt/service/core/ai/model/runtime';
import type { SystemMigrationContext } from '@/migration/registry';
import { migrateModelPricing } from '@/migration/tasks/4180/20261120_migrate_model_pricing';

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
    migrationId: '20261120_migrate_model_pricing',
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

const seedStt = async (overrides: Record<string, unknown> = {}) => {
  const _id = new Types.ObjectId();
  const raw = {
    _id,
    type: ModelTypeEnum.stt,
    scope: ModelScopeEnum.system,
    model: `stt-${_id}`,
    name: 'STT',
    provider: 'openai',
    config: {},
    requestAuth: 'fixture-secret',
    ...overrides
  };
  await MongoAIModel.collection.insertOne(raw as any);
  return raw;
};

const seedLlm = async (overrides: Record<string, unknown> = {}) => {
  const _id = new Types.ObjectId();
  const raw = {
    _id,
    type: ModelTypeEnum.llm,
    scope: ModelScopeEnum.system,
    model: `llm-${_id}`,
    name: 'LLM',
    provider: 'openai',
    config: { maxContext: 128000, maxResponse: 8192, quoteMaxToken: 100000 },
    requestAuth: 'fixture-secret',
    ...overrides
  };
  await MongoAIModel.collection.insertOne(raw as any);
  return raw;
};

describe('migrateModelPricing', () => {
  it('runs STT backfill and leaves rates, explicit types, team isolation and catalogs intact', async () => {
    const records = [];
    for (const pricing of [
      undefined,
      null,
      {},
      { unitPrice: 0.2 },
      { unitPrice: 0 },
      { type: 'tokens', unitPrice: 10 },
      { type: 'duration', unitPrice: 0.3 }
    ]) {
      records.push(await seedStt(pricing === undefined ? {} : { pricing }));
    }
    records.push(
      await seedStt({
        scope: ModelScopeEnum.team,
        teamId: new Types.ObjectId(),
        pricing: { unitPrice: 0.4, retained: 'value' }
      })
    );
    const other = await seedStt({ type: ModelTypeEnum.embedding, pricing: { unitPrice: 2 } });

    expect(await migrateModelPricing(createContext().context)).toEqual({
      sttModels: 8,
      llmModels: 0
    });
    for (const raw of records) {
      const pricing = 'pricing' in raw ? (raw.pricing as Record<string, unknown>) : undefined;
      expect(await MongoAIModel.collection.findOne({ _id: raw._id })).toEqual({
        ...raw,
        pricing: { ...pricing, type: pricing?.type ?? 'duration' }
      });
    }
    expect(await MongoAIModel.collection.findOne({ _id: other._id })).toEqual(other);
    const catalogs = await MongoAIModelCatalog.find({}).lean();
    expect(await migrateModelPricing(createContext().context)).toEqual({
      sttModels: 8,
      llmModels: 0
    });
    expect(await MongoAIModelCatalog.find({}).lean()).toEqual(catalogs);
  });

  it('reports invalid STT prices without copying secrets and retries repaired failures behind the cursor', async () => {
    const bad = await seedStt({ pricing: { unitPrice: -1 } });
    const good = await seedStt({ pricing: { unitPrice: 0.2 } });
    const state = createContext();
    await expect(migrateModelPricing(state.context)).rejects.toThrow('require repair');
    expect(await MongoAIModel.collection.findOne({ _id: bad._id })).toEqual(bad);
    expect((await MongoAIModel.collection.findOne({ _id: good._id }))?.pricing).toMatchObject({
      type: 'duration',
      unitPrice: 0.2
    });
    expect(state.failures()).toEqual([
      expect.objectContaining({ stageKey: 'stt', data: { id: String(bad._id) } })
    ]);
    expect(JSON.stringify(state.failures())).not.toContain('fixture-secret');

    await MongoAIModel.collection.updateOne(
      { _id: bad._id },
      { $set: { pricing: { unitPrice: 0 } } }
    );
    expect(await migrateModelPricing(state.context)).toEqual({ sttModels: 2, llmModels: 0 });
    expect(state.failures()).toEqual([]);
  });

  it('replays committed STT writes when checkpoint persistence fails', async () => {
    for (let i = 0; i < 3; i++) await seedStt({ pricing: { unitPrice: 0.2 } });
    const state = createContext();
    const save = state.context.saveCheckpoint.getMockImplementation()!;
    state.context.saveCheckpoint
      .mockImplementationOnce(save)
      .mockRejectedValueOnce(new Error('checkpoint crash'));
    await expect(migrateModelPricing(state.context)).rejects.toThrow('checkpoint crash');
    state.context.saveCheckpoint.mockImplementation(save);
    expect(await migrateModelPricing(state.context)).toEqual({ sttModels: 3, llmModels: 0 });
    expect(await MongoAIModel.countDocuments({ 'pricing.type': 'duration' })).toBe(3);
  });

  it('keeps STT validation failures recoverable after stt step completes and finds late writes', async () => {
    const raw = await seedStt({ pricing: { unitPrice: 0.2 } });
    const state = createContext();
    let lateId: string;
    state.context.reportProgress.mockImplementation(async ({ key, status }) => {
      if (key === 'validation' && status === 'running') {
        await MongoAIModel.collection.updateOne(
          { _id: raw._id },
          { $unset: { 'pricing.type': 1 } }
        );
        lateId = String((await seedStt({ pricing: { unitPrice: 0.3 } }))._id);
      }
    });
    await expect(migrateModelPricing(state.context)).rejects.toThrow('validation failed');
    expect(state.failures()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stageKey: 'validation',
          data: { id: String(raw._id), modelType: ModelTypeEnum.stt }
        }),
        expect.objectContaining({
          stageKey: 'validation',
          data: { id: lateId!, modelType: ModelTypeEnum.stt }
        })
      ])
    );
    state.context.reportProgress.mockReset();
    expect(await migrateModelPricing(state.context)).toEqual({ sttModels: 1, llmModels: 0 });
    expect(await MongoAIModel.countDocuments({ 'pricing.type': 'duration' })).toBe(2);
    expect(state.failures()).toEqual([]);
  });

  it('fails LLM step atomically when a tier is invalid, preserves completed STT step, and commits on retry', async () => {
    const stt = await seedStt({ pricing: { unitPrice: 0.2 } });
    const valid = await seedLlm({
      pricing: { tiers: [{ maxInputTokens: 0.128, inputPrice: 100, outputPrice: 200 }] }
    });
    const invalid = await seedLlm({
      pricing: { tiers: [{ maxInputTokens: -0.5, inputPrice: 10, outputPrice: 20 }] }
    });

    const state = createContext();
    await expect(migrateModelPricing(state.context)).rejects.toThrow('require repair');
    expect((await MongoAIModel.collection.findOne({ _id: stt._id }))?.pricing).toEqual({
      type: 'duration',
      unitPrice: 0.2
    });
    expect(state.failures()).toEqual([
      expect.objectContaining({ stageKey: 'llmTiers', data: { id: String(invalid._id) } })
    ]);
    expect(JSON.stringify(state.failures())).not.toContain('fixture-secret');
    expect(await MongoAIModel.collection.findOne({ _id: valid._id })).toEqual(valid);

    await MongoAIModel.collection.updateOne(
      { _id: invalid._id },
      { $set: { 'pricing.tiers': [{ maxInputTokens: 0.032, inputPrice: 10, outputPrice: 20 }] } }
    );
    expect(await migrateModelPricing(state.context)).toEqual({ sttModels: 1, llmModels: 2 });
    expect((await MongoAIModel.collection.findOne({ _id: valid._id }))?.pricing).toEqual({
      tiers: [{ maxInputTokens: 0.128, maxInputTokensK: 128, inputPrice: 100, outputPrice: 200 }]
    });
    expect((await MongoAIModel.collection.findOne({ _id: invalid._id }))?.pricing).toEqual({
      tiers: [{ maxInputTokens: 0.032, maxInputTokensK: 32, inputPrice: 10, outputPrice: 20 }]
    });
  });

  it('retries the LLM backfill after validation finds a concurrent legacy write', async () => {
    const pricing = { tiers: [{ maxInputTokens: 0.032, inputPrice: 10, outputPrice: 20 }] };
    const existing = await seedLlm({ pricing });
    const state = createContext();
    let lateId: Types.ObjectId | undefined;
    state.context.reportProgress.mockImplementation(async ({ key, status }) => {
      if (key === 'validation' && status === 'running') {
        lateId = (await seedLlm({ pricing }))._id;
      }
    });

    await expect(migrateModelPricing(state.context)).rejects.toThrow('validation failed');
    expect(state.failures()).toMatchObject([
      { stageKey: 'validation', data: { id: String(lateId) } }
    ]);

    state.context.reportProgress.mockReset();
    expect(await migrateModelPricing(state.context)).toEqual({ sttModels: 0, llmModels: 2 });
    for (const _id of [existing._id, lateId]) {
      expect((await MongoAIModel.collection.findOne({ _id }))?.pricing).toEqual({
        tiers: [{ ...pricing.tiers[0], maxInputTokensK: 32 }]
      });
    }
  });

  it('rolls back LLM transaction if catalog revision fails, skips empty collections, and keeps post-commit retries idempotent', async () => {
    expect(await migrateModelPricing(createContext().context)).toEqual({
      sttModels: 0,
      llmModels: 0
    });
    expect(await MongoAIModelCatalog.countDocuments({})).toBe(0);

    const model = await seedLlm({
      pricing: { tiers: [{ maxInputTokens: 0.272, inputPrice: 1680, outputPrice: 8400 }] }
    });
    const smallBoundModel = await seedLlm({
      pricing: { tiers: [{ maxInputTokens: 0.005, inputPrice: 10, outputPrice: 20 }] }
    });
    const revisionSpy = vi
      .spyOn(MongoAIModelCatalog, 'updateOne')
      .mockRejectedValueOnce(new Error('revision unavailable'));
    await expect(migrateModelPricing(createContext().context)).rejects.toThrow(
      'revision unavailable'
    );
    expect(await MongoAIModel.collection.findOne({ _id: model._id })).toEqual(model);
    expect(await MongoAIModel.collection.findOne({ _id: smallBoundModel._id })).toEqual(
      smallBoundModel
    );

    revisionSpy.mockRestore();
    const state = createContext();
    // 模拟 llmTiers 事务已提交但 checkpoint 尚未保存就中断，验证小上限重跑不会被二次换算。
    const originalSaveCheckpoint = state.context.saveCheckpoint.getMockImplementation()!;
    let failLlmCheckpoint = true;
    state.context.saveCheckpoint.mockImplementation(async (value) => {
      if (failLlmCheckpoint && value.llmMigrated !== undefined) {
        failLlmCheckpoint = false;
        throw new Error('checkpoint store unavailable after commit');
      }
      return originalSaveCheckpoint(value);
    });
    await expect(migrateModelPricing(state.context)).rejects.toThrow(
      'checkpoint store unavailable after commit'
    );
    expect((await MongoAIModel.collection.findOne({ _id: smallBoundModel._id }))?.pricing).toEqual({
      tiers: [{ maxInputTokens: 0.005, maxInputTokensK: 5, inputPrice: 10, outputPrice: 20 }]
    });

    expect(await migrateModelPricing(state.context)).toEqual({ sttModels: 0, llmModels: 0 });
    expect((await MongoAIModel.collection.findOne({ _id: model._id }))?.pricing).toEqual({
      tiers: [{ maxInputTokens: 0.272, maxInputTokensK: 272, inputPrice: 1680, outputPrice: 8400 }]
    });
    expect((await MongoAIModel.collection.findOne({ _id: smallBoundModel._id }))?.pricing).toEqual({
      tiers: [{ maxInputTokens: 0.005, maxInputTokensK: 5, inputPrice: 10, outputPrice: 20 }]
    });
    const runtimeSmall = formatDbModelToRuntimeModel(
      (await MongoAIModel.collection.findOne({ _id: smallBoundModel._id })) as any,
      { fallbackProvider: true }
    );
    expect(calculateModelPrice({ config: runtimeSmall, inputTokens: 5000 }).matchedTier).toEqual({
      maxInputTokensK: 5,
      inputPrice: 10,
      outputPrice: 20
    });

    // lease 丢失时不写入新 STT 记录
    const rawStt = await seedStt();
    const lostState = createContext();
    lostState.context.assertActive.mockRejectedValueOnce(new Error('lease lost'));
    await expect(migrateModelPricing(lostState.context)).rejects.toThrow('lease lost');
    expect(await MongoAIModel.collection.findOne({ _id: rawStt._id })).toEqual(rawStt);
  });

  it('verifies a mixed 10+ model catalog across STT backfill, legacy M/K limit backfill, and billing', async () => {
    const fixtures = await Promise.all([
      // 1~2. STT 历史时长模式 + 已有 tokens 模式
      seedStt({ model: 'mock-whisper-legacy', pricing: { unitPrice: 0.2 } }),
      seedStt({
        model: 'mock-stt-tokens',
        pricing: { type: 'tokens', inputPrice: 6, outputPrice: 12 }
      }),
      // 3. 128K LLM
      seedLlm({
        model: 'mock-gpt-4o',
        pricing: {
          tiers: [
            { maxInputTokens: 0.128, inputPrice: 2.5, outputPrice: 10 },
            { inputPrice: 5, outputPrice: 20 }
          ]
        }
      }),
      // 4. 多档 32K / 272K LLM
      seedLlm({
        model: 'mock-gpt-5',
        pricing: {
          tiers: [
            { maxInputTokens: 0.032, inputPrice: 100, outputPrice: 200 },
            { maxInputTokens: 0.272, inputPrice: 1680, outputPrice: 8400 },
            { inputPrice: 3360, outputPrice: 12600 }
          ]
        }
      }),
      // 5. 浮点边界 0.29 -> 290
      seedLlm({
        model: 'mock-claude',
        pricing: { tiers: [{ maxInputTokens: 0.29, inputPrice: 3, outputPrice: 15 }] }
      }),
      // 6. 小数四舍五入：0.0041 -> 4, 0.0046 -> 5
      seedLlm({
        model: 'mock-deepseek',
        pricing: {
          tiers: [
            { maxInputTokens: 0.0041, inputPrice: 1, outputPrice: 2 },
            { maxInputTokens: 0.0046, inputPrice: 2, outputPrice: 4 }
          ]
        }
      }),
      // 7. 0 -> 1 与已回填的 K 上限
      seedLlm({
        model: 'mock-zero-bound',
        pricing: { tiers: [{ maxInputTokens: 0, inputPrice: 1, outputPrice: 2 }] }
      }),
      seedLlm({
        model: 'mock-boundary-10m',
        pricing: {
          tiers: [{ maxInputTokens: 10, maxInputTokensK: 12, inputPrice: 15, outputPrice: 30 }]
        }
      }),
      // 8~9. 旧 K 整数（32K 与 [8, 32]）
      seedLlm({
        model: 'mock-already-k-32',
        pricing: {
          tiers: [
            { maxInputTokens: 32, inputPrice: 1000, outputPrice: 2000 },
            { inputPrice: 3000, outputPrice: 6000 }
          ]
        }
      }),
      seedLlm({
        model: 'mock-already-k-8-32',
        pricing: {
          tiers: [
            { maxInputTokens: 8, inputPrice: 500, outputPrice: 1000 },
            { maxInputTokens: 32, inputPrice: 1000, outputPrice: 2000 },
            { inputPrice: 3000, outputPrice: 6000 }
          ]
        }
      }),
      // 10~12. 开放式 LLM、Team LLM、Embedding（不受影响）
      seedLlm({
        model: 'mock-open-llm',
        pricing: { tiers: [{ inputPrice: 10, outputPrice: 20 }] }
      }),
      seedLlm({
        model: 'mock-team-llm',
        scope: ModelScopeEnum.team,
        teamId: new Types.ObjectId(),
        pricing: { tiers: [{ maxInputTokens: 0.128, inputPrice: 1, outputPrice: 2 }] }
      }),
      seedLlm({
        model: 'mock-embedding',
        type: ModelTypeEnum.embedding,
        config: { defaultToken: 512, maxToken: 8192 },
        pricing: { unitPrice: 50 }
      })
    ]);

    const loadRuntime = async (id: Types.ObjectId) => {
      const doc = await MongoAIModel.collection.findOne({ _id: id });
      return { doc, runtime: formatDbModelToRuntimeModel(doc as any, { fallbackProvider: true }) };
    };

    const before = await loadRuntime(fixtures[2]._id);
    expect(calculateModelPrice({ config: before.runtime, inputTokens: 200_000 })).toMatchObject({
      matchedTier: { inputPrice: 2.5, outputPrice: 10 },
      totalPoints: 0.5
    });

    expect(await migrateModelPricing(createContext().context)).toEqual({
      sttModels: 2,
      llmModels: 7
    });

    // STT 1~2
    const sttLegacy = await loadRuntime(fixtures[0]._id);
    expect(sttLegacy.doc?.pricing).toEqual({ type: 'duration', unitPrice: 0.2 });
    expect(
      calculateModelPrice({
        config: sttLegacy.runtime,
        sttUsage: { type: 'duration', seconds: 30 }
      }).totalPoints
    ).toBeCloseTo(0.1, 12);
    const sttTokens = await loadRuntime(fixtures[1]._id);
    expect(sttTokens.doc?.pricing).toEqual({ type: 'tokens', inputPrice: 6, outputPrice: 12 });
    expect(
      calculateModelPrice({
        config: sttTokens.runtime,
        sttUsage: { type: 'tokens', inputTokens: 1_000_000, outputTokens: 500_000 }
      }).totalPoints
    ).toBe(12);

    // LLM 128K & 272K & 浮点边界
    const m128 = await loadRuntime(fixtures[2]._id);
    expect(m128.doc?.pricing.tiers[0]).toEqual({
      maxInputTokens: 0.128,
      maxInputTokensK: 128,
      inputPrice: 2.5,
      outputPrice: 10
    });
    expect(calculateModelPrice({ config: m128.runtime, inputTokens: 128_000 }).totalPoints).toBe(
      0.32
    );
    expect(calculateModelPrice({ config: m128.runtime, inputTokens: 128_001 }).matchedTier).toEqual(
      { inputPrice: 5, outputPrice: 20 }
    );

    const m272 = await loadRuntime(fixtures[3]._id);
    expect(m272.doc?.pricing.tiers.map((t: any) => t.maxInputTokensK)).toEqual([
      32,
      272,
      undefined
    ]);
    expect(
      calculateModelPrice({ config: m272.runtime, inputTokens: 272_000, outputTokens: 1_000 })
    ).toMatchObject({
      matchedTier: { maxInputTokensK: 272, inputPrice: 1680, outputPrice: 8400 },
      totalPoints: 465.36
    });

    expect((await loadRuntime(fixtures[4]._id)).doc?.pricing.tiers[0].maxInputTokensK).toBe(290);
    expect(
      (await loadRuntime(fixtures[5]._id)).doc?.pricing.tiers.map((t: any) => t.maxInputTokensK)
    ).toEqual([4, 5]);
    expect((await loadRuntime(fixtures[6]._id)).doc?.pricing.tiers[0].maxInputTokensK).toBe(1);
    expect((await loadRuntime(fixtures[7]._id)).doc?.pricing).toEqual({
      tiers: [{ maxInputTokens: 10, maxInputTokensK: 12, inputPrice: 15, outputPrice: 30 }]
    });

    // 旧 K 整数与开放档回填，团队 LLM 和 Embedding 隔离
    const skip32 = await loadRuntime(fixtures[8]._id);
    expect(skip32.doc?.pricing).toEqual({
      tiers: [
        { maxInputTokens: 32, maxInputTokensK: 32, inputPrice: 1000, outputPrice: 2000 },
        { inputPrice: 3000, outputPrice: 6000 }
      ]
    });
    expect(calculateModelPrice({ config: skip32.runtime, inputTokens: 32_000 }).totalPoints).toBe(
      32
    );
    const skipMixed = await loadRuntime(fixtures[9]._id);
    expect(skipMixed.doc?.pricing.tiers.map((t: any) => t.maxInputTokensK)).toEqual([
      8,
      32,
      undefined
    ]);
    expect(calculateModelPrice({ config: skipMixed.runtime, inputTokens: 8_000 }).totalPoints).toBe(
      4
    );
    expect((await loadRuntime(fixtures[10]._id)).doc?.pricing).toEqual({
      tiers: [{ inputPrice: 10, outputPrice: 20 }]
    });
    expect((await loadRuntime(fixtures[11]._id)).doc).toEqual(fixtures[11]);
    expect((await loadRuntime(fixtures[12]._id)).doc).toEqual(fixtures[12]);
  });
});
