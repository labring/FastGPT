import { ModelPricingSchema } from '@fastgpt/global/core/ai/model/schema';
import { calculateModelPrice } from '@fastgpt/global/core/ai/model/pricing';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { Call } from '@test/utils/request';
import { getRootUser } from '@test/datas/users';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const configMocks = vi.hoisted(() => ({
  updatedReloadSystemModel: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog/service')>();

  return {
    ...actual,
    updatedReloadSystemModel: configMocks.updatedReloadSystemModel
  };
});

vi.mock('@fastgpt/service/core/ai/model/channel/binding', () => ({
  syncModelNameInChannels: vi.fn().mockResolvedValue(undefined),
  removeModelsFromChannels: vi.fn().mockResolvedValue(undefined),
  updateModelChannelBindings: vi.fn().mockResolvedValue(undefined)
}));

import updateWithJsonApi from '@/pages/api/core/ai/model/updateWithJson';
import getConfigJsonApi from '@/pages/api/core/ai/model/getConfigJson';

const buildLlmConfig = ({ modelId, model = 'test-llm' }: { modelId: string; model?: string }) => ({
  modelId,
  model,
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  name: 'Test LLM',
  scope: 'system' as const,
  config: {
    maxContext: 16000,
    maxResponse: 8000,
    quoteMaxToken: 12000,
    toolChoice: true
  },
  isActive: true
});

const buildEmbeddingConfig = ({
  modelId,
  model = 'test-embedding'
}: {
  modelId: string;
  model?: string;
}) => ({
  modelId,
  model,
  type: ModelTypeEnum.embedding,
  provider: 'OpenAI',
  name: 'Test Embedding',
  scope: 'system' as const,
  config: {
    defaultToken: 500,
    maxToken: 3000,
    weight: 0
  },
  isActive: true
});

const buildStoredLlm = (model: string) => ({
  model,
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  name: model,
  scope: 'system' as const,
  isActive: true,
  config: {
    maxContext: 8000,
    maxResponse: 4000,
    quoteMaxToken: 6000,
    toolChoice: true
  }
});

const callUpdateWithJson = async (config: string) => {
  const root = await getRootUser();
  return Call(updateWithJsonApi, { auth: root, body: { config } });
};

describe('admin settings model updateWithJson api', () => {
  beforeEach(() => {
    configMocks.updatedReloadSystemModel.mockReset().mockResolvedValue(undefined);
  });

  it('keeps million-unit prices across an export/import round trip', async () => {
    const { insertedId: modelId } = await MongoAIModel.collection.insertOne({
      ...buildStoredLlm('legacy-priced'),
      inputPrice: 0.001,
      outputPrice: 0.003,
      pricing: {
        tiers: [{ inputPrice: 1, outputPrice: 3, cacheReadPrice: 0, cacheCreationPrice: 0.125 }]
      }
    });
    const root = await getRootUser();
    const exported = await Call<string>(getConfigJsonApi, { auth: root });
    const result = await callUpdateWithJson(exported.data);
    expect(result.code).toBe(200);
    const saved = await MongoAIModel.findById(modelId).lean();
    expect(ModelPricingSchema.parse(saved?.pricing).tiers).toMatchObject([
      { inputPrice: 1, outputPrice: 3, cacheReadPrice: 0, cacheCreationPrice: 0.13 }
    ]);
    expect(saved).toMatchObject({ inputPrice: 0.001, outputPrice: 0.003 });
  });

  it('imports new prices without rescaling and permits an explicitly free edit', async () => {
    const existingModel = await MongoAIModel.create(buildStoredLlm('import-priced'));
    const input = {
      ...buildLlmConfig({ modelId: String(existingModel._id) }),
      pricing: { tiers: [{ inputPrice: 2, outputPrice: 4 }] }
    };
    expect((await callUpdateWithJson(JSON.stringify([input]))).code).toBe(200);
    expect(
      ModelPricingSchema.parse((await MongoAIModel.findById(existingModel._id).lean())?.pricing)
        .tiers
    ).toMatchObject([{ inputPrice: 2, outputPrice: 4 }]);
    // 新阶梯为空表示免费，导入不恢复旧价格。
    expect(
      (await callUpdateWithJson(JSON.stringify([{ ...input, pricing: { tiers: [] } }]))).code
    ).toBe(200);
    const saved = await MongoAIModel.findById(existingModel._id).lean();
    expect(ModelPricingSchema.parse(saved?.pricing).tiers).toEqual([]);
    expect(saved).not.toHaveProperty('inputPrice');
    expect(saved).not.toHaveProperty('outputPrice');
  });

  it.each([
    { legacyBound: 0.128, expectedBoundK: 128 },
    { legacyBound: 1.024, expectedBoundK: 1024 },
    { legacyBound: 32, expectedBoundK: 32, tierUnit: 'K' },
    { legacyBound: 0.128, expectedBoundK: 256, maxInputTokensK: 256 }
  ])(
    'preserves tier pricing when importing an older bound ($legacyBound)',
    async ({ legacyBound, expectedBoundK, tierUnit, maxInputTokensK }) => {
      const res = await callUpdateWithJson(
        JSON.stringify([
          {
            ...buildLlmConfig({ modelId: 'external-id' }),
            pricing: {
              tierUnit,
              tiers: [
                { maxInputTokens: legacyBound, maxInputTokensK, inputPrice: 10, outputPrice: 20 },
                { inputPrice: 80, outputPrice: 160 }
              ]
            }
          }
        ])
      );

      expect(res.code).toBe(200);
      const model = await MongoAIModel.collection.findOne({ model: 'test-llm' });
      expect(model?.pricing).toEqual({
        tiers: [
          { maxInputTokensK: expectedBoundK, inputPrice: 10, outputPrice: 20 },
          { inputPrice: 80, outputPrice: 160 }
        ]
      });
      const config = {
        scope: ModelScopeEnum.system,
        type: ModelTypeEnum.llm,
        pricing: ModelPricingSchema.parse(model?.pricing)
      };
      const boundary = expectedBoundK * 1000;
      expect(calculateModelPrice({ config, inputTokens: boundary }).matchedTier?.inputPrice).toBe(
        10
      );
      expect(
        calculateModelPrice({ config, inputTokens: boundary + 1 }).matchedTier?.inputPrice
      ).toBe(80);
    }
  );

  it('rejects an old sub-K threshold before replacing any models', async () => {
    const existingModel = await MongoAIModel.create(buildStoredLlm('keep-on-error'));
    const res = await callUpdateWithJson(
      JSON.stringify([
        {
          ...buildLlmConfig({ modelId: 'external-id' }),
          pricing: {
            tiers: [
              { maxInputTokens: 0.1285, inputPrice: 10, outputPrice: 20 },
              { inputPrice: 80, outputPrice: 160 }
            ]
          }
        }
      ])
    );

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoAIModel.countDocuments({ _id: existingModel._id })).resolves.toBe(1);
    expect(configMocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });

  it('canonicalizes newly imported LLM prices and keeps embedding prices in M tokens', async () => {
    const result = await callUpdateWithJson(
      JSON.stringify([
        {
          ...buildLlmConfig({ modelId: 'external-llm', model: 'new-llm' }),
          pricing: { tiers: [{ inputPrice: 3, outputPrice: 3 }] }
        },
        {
          ...buildEmbeddingConfig({ modelId: 'external-embedding', model: 'new-embedding' }),
          pricing: { unitPrice: 4 }
        }
      ])
    );
    expect(result.code).toBe(200);
    const llm = await MongoAIModel.findOne({ model: 'new-llm' }).lean();
    expect(ModelPricingSchema.parse(llm?.pricing).tiers).toMatchObject([
      { inputPrice: 3, outputPrice: 3 }
    ]);
    expect(llm).not.toHaveProperty('pricing.unitPrice');
    expect(await MongoAIModel.findOne({ model: 'new-embedding' }).lean()).toMatchObject({
      pricing: { unitPrice: 4 }
    });
  });

  it('round-trips million-unit token and TTS prices while keeping STT duration prices unchanged', async () => {
    const entries = [
      { type: ModelTypeEnum.embedding, config: { defaultToken: 500, maxToken: 3000, weight: 0 } },
      { type: ModelTypeEnum.rerank, config: {} },
      { type: ModelTypeEnum.tts, config: { voices: [{ label: 'Default', value: 'default' }] } },
      { type: ModelTypeEnum.stt, config: {} }
    ].map(({ type, config }) => ({
      modelId: `external-${type}`,
      model: `unit-${type}`,
      name: type,
      provider: 'OpenAI',
      type,
      scope: 'system',
      isActive: true,
      config,
      pricing: { unitPrice: 0.125 }
    }));
    expect((await callUpdateWithJson(JSON.stringify(entries))).code).toBe(200);
    const first = await MongoAIModel.find({}).lean();
    for (const entry of entries) {
      expect(first.find(({ model }) => model === entry.model)).toMatchObject({
        pricing: {
          ...(entry.type === ModelTypeEnum.stt ? { type: 'duration' } : {}),
          unitPrice: 0.13
        }
      });
    }
    const root = await getRootUser();
    const exported = await Call<string>(getConfigJsonApi, { auth: root });
    expect((await callUpdateWithJson(exported.data)).code).toBe(200);
    const second = await MongoAIModel.find({}).lean();
    expect(second.map(({ model, pricing }) => ({ model, pricing }))).toEqual(
      first.map(({ model, pricing }) => ({ model, pricing }))
    );
  });

  it('rejects missing STT token price type before replacing a stored token price', async () => {
    const pricing = { type: 'tokens' as const, inputPrice: 2, outputPrice: 4 };
    const model = await MongoAIModel.create({
      ...buildStoredLlm('stt-token-pricing'),
      type: ModelTypeEnum.stt,
      config: {},
      pricing
    });
    const invalid = {
      ...buildLlmConfig({ modelId: String(model._id), model: model.model }),
      type: ModelTypeEnum.stt,
      config: {},
      pricing: { inputPrice: 2, outputPrice: 4 }
    };
    const result = await callUpdateWithJson(JSON.stringify([invalid]));

    expect(result.error?.name).toBe('ApiRequestInputParseError');
    expect((await MongoAIModel.collection.findOne({ _id: model._id }))?.pricing).toEqual(pricing);
    expect(configMocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });

  it('updates matching IDs, creates external models by model and deletes omitted records', async () => {
    const oldModel = await MongoAIModel.create(buildStoredLlm('old-model'));
    const existingModel = await MongoAIModel.create(buildStoredLlm('test-llm'));

    const res = await callUpdateWithJson(
      JSON.stringify([
        buildLlmConfig({ modelId: String(existingModel._id) }),
        buildEmbeddingConfig({ modelId: 'external-system-model-id' })
      ])
    );

    expect(res.code).toBe(200);
    expect(await MongoAIModel.findById(oldModel._id).lean()).toBeNull();
    const updatedModel = await MongoAIModel.findOne({ model: 'test-llm' }).lean();
    expect(String(updatedModel?._id)).toBe(String(existingModel._id));
    expect(updatedModel).toMatchObject({
      scope: 'system',
      config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
    });
    const externalModel = await MongoAIModel.findOne({ model: 'test-embedding' }).lean();
    expect(externalModel).toMatchObject({ scope: 'system', config: { weight: 0 } });
    expect(String(externalModel?._id)).not.toBe('external-system-model-id');
  });

  it('updates the stored model identifier when a local modelId imports a different model', async () => {
    const existingModel = await MongoAIModel.create(buildStoredLlm('stored-model'));

    const res = await callUpdateWithJson(
      JSON.stringify([
        {
          ...buildLlmConfig({
            modelId: String(existingModel._id),
            model: 'renamed-model'
          }),
          name: 'Updated display name'
        }
      ])
    );

    expect(res.code).toBe(200);
    await expect(MongoAIModel.findById(existingModel._id).lean()).resolves.toMatchObject({
      model: 'renamed-model',
      name: 'Updated display name',
      isActive: true,
      config: { maxContext: 16000 }
    });
    await expect(MongoAIModel.findOne({ model: 'stored-model' }).lean()).resolves.toBeNull();
  });

  it('clears omitted optional fields when replacing a local model config', async () => {
    const existingModel = await MongoAIModel.create({
      ...buildStoredLlm('stored-model'),
      requestUrl: 'https://old.example.com/v1',
      requestAuth: 'old-secret',
      testMode: true,

      pricing: { tiers: [{ inputPrice: 1, outputPrice: 2 }] }
    });

    const res = await callUpdateWithJson(
      JSON.stringify([buildLlmConfig({ modelId: String(existingModel._id) })])
    );

    expect(res.code).toBe(200);
    const updated = await MongoAIModel.findById(existingModel._id).lean();
    expect(updated).not.toHaveProperty('requestUrl');
    expect(updated).not.toHaveProperty('requestAuth');
    expect(updated).not.toHaveProperty('testMode');
    expect(updated).not.toHaveProperty('pricing.unitPrice');
    expect(updated).not.toHaveProperty('inputPrice');
    expect(updated).not.toHaveProperty('outputPrice');
    expect(updated?.pricing).toEqual({});
  });

  it('requires model when modelId does not match a local model', async () => {
    const { model: _model, ...configWithoutModel } = buildLlmConfig({ modelId: 'external-id' });

    const res = await callUpdateWithJson(JSON.stringify([configWithoutModel]));
    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
    expect(configMocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });

  it('reuses a target model ID when an external ID points to an existing provider model', async () => {
    const existing = await MongoAIModel.create({
      ...buildStoredLlm('test-llm'),
      requestAuth: 'stale-secret',
      pricing: { unitPrice: 5 }
    });
    const res = await callUpdateWithJson(
      JSON.stringify([buildLlmConfig({ modelId: 'another-system-id' })])
    );

    expect(res.code).toBe(200);
    const updated = await MongoAIModel.findOne({ model: 'test-llm' }).lean();
    expect(String(updated?._id)).toBe(String(existing._id));
    expect(updated?.config).toMatchObject({ maxContext: 16000 });
    expect(updated).not.toHaveProperty('requestAuth');
    expect(updated).not.toHaveProperty('pricing.unitPrice');
  });

  it('rejects malformed JSON as an input parse error', async () => {
    const res = await callUpdateWithJson('{invalid-json');

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects non-canonical latest records instead of repairing them', async () => {
    const config = buildLlmConfig({ modelId: 'external-id' });
    config.config.maxContext = '16000' as unknown as number;

    const res = await callUpdateWithJson(JSON.stringify([config]));

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects same-name models even when their types differ', async () => {
    const llm = await MongoAIModel.create(buildStoredLlm('shared-model'));

    const res = await callUpdateWithJson(
      JSON.stringify([
        buildLlmConfig({ modelId: String(llm._id), model: 'shared-model' }),
        buildEmbeddingConfig({ modelId: 'external-model-id', model: 'shared-model' })
      ])
    );

    expect(res.error?.name).toBe('UserError');
    await expect(MongoAIModel.countDocuments({ model: 'shared-model' })).resolves.toBe(1);
    expect(configMocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });

  it('rejects update if target model name already exists for another model during JSON import', async () => {
    const existing1 = await MongoAIModel.create(buildStoredLlm('model-1'));
    const existing2 = await MongoAIModel.create(buildStoredLlm('model-2'));

    const res = await callUpdateWithJson(
      JSON.stringify([
        buildLlmConfig({ modelId: String(existing1._id), model: 'model-2' }),
        buildLlmConfig({ modelId: String(existing2._id), model: 'model-2-renamed' })
      ])
    );

    expect(res.error?.name).toBe('UserError');
    expect(res.error?.message).toContain('already in use');
  });
});
