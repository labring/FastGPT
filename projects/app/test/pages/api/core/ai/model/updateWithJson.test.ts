import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { Call } from '@test/utils/request';
import { getRootUser } from '@test/datas/users';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const configMocks = vi.hoisted(() => ({
  updatedReloadSystemModel: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/config/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/config/utils')>();

  return {
    ...actual,
    updatedReloadSystemModel: configMocks.updatedReloadSystemModel
  };
});

import updateWithJsonApi from '@/pages/api/admin/settings/model/updateWithJson';
import getConfigJsonApi from '@/pages/api/admin/settings/model/getConfigJson';

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

  it('keeps legacy prices across an export/import round trip while removing old fields on save', async () => {
    const existingModel = await MongoAIModel.create({
      ...buildStoredLlm('legacy-priced'),
      inputPrice: 1,
      outputPrice: 3
    });
    const root = await getRootUser();
    const exported = await Call<string>(getConfigJsonApi, { auth: root });
    const result = await callUpdateWithJson(exported.data);
    expect(result.code).toBe(200);
    const saved = await MongoAIModel.findById(existingModel._id).lean();
    expect(saved?.priceTiers).toMatchObject([{ inputPrice: 1, outputPrice: 3 }]);
    expect(saved).not.toHaveProperty('inputPrice');
    expect(saved).not.toHaveProperty('outputPrice');
  });

  it('converts legacy imports like opening the editor and saves canonical free tiers without old fields', async () => {
    const existingModel = await MongoAIModel.create(buildStoredLlm('import-priced'));
    const input = {
      ...buildLlmConfig({ modelId: String(existingModel._id) }),
      inputPrice: 2,
      outputPrice: 4
    };
    expect((await callUpdateWithJson(JSON.stringify([input]))).code).toBe(200);
    expect((await MongoAIModel.findById(existingModel._id).lean())?.priceTiers).toMatchObject([
      { inputPrice: 2, outputPrice: 4 }
    ]);
    // 和编辑器一样，先转换并移除旧字段；之后的新价格为空即表示免费。
    const { inputPrice: _inputPrice, outputPrice: _outputPrice, ...newConfig } = input;
    expect(
      (await callUpdateWithJson(JSON.stringify([{ ...newConfig, priceTiers: [] }]))).code
    ).toBe(200);
    const saved = await MongoAIModel.findById(existingModel._id).lean();
    expect(saved?.priceTiers).toEqual([]);
    expect(saved).not.toHaveProperty('inputPrice');
    expect(saved).not.toHaveProperty('outputPrice');
  });

  it('canonicalizes newly imported LLM prices without changing non-LLM pricing', async () => {
    const result = await callUpdateWithJson(
      JSON.stringify([
        { ...buildLlmConfig({ modelId: 'external-llm', model: 'new-llm' }), charsPointsPrice: 3 },
        {
          ...buildEmbeddingConfig({ modelId: 'external-embedding', model: 'new-embedding' }),
          charsPointsPrice: 4
        }
      ])
    );
    expect(result.code).toBe(200);
    const llm = await MongoAIModel.findOne({ model: 'new-llm' }).lean();
    expect(llm?.priceTiers).toMatchObject([{ inputPrice: 3, outputPrice: 3 }]);
    expect(llm).not.toHaveProperty('charsPointsPrice');
    expect(await MongoAIModel.findOne({ model: 'new-embedding' }).lean()).toMatchObject({
      charsPointsPrice: 4
    });
  });

  it('updates matching IDs, creates external models by model and disables omitted records', async () => {
    const oldModel = await MongoAIModel.create(buildStoredLlm('old-model'));
    const existingModel = await MongoAIModel.create(buildStoredLlm('test-llm'));

    const res = await callUpdateWithJson(
      JSON.stringify([
        buildLlmConfig({ modelId: String(existingModel._id) }),
        buildEmbeddingConfig({ modelId: 'external-system-model-id' })
      ])
    );

    expect(res.code).toBe(200);
    const disabledModel = await MongoAIModel.findById(oldModel._id).lean();
    expect(disabledModel?.isActive).toBe(false);
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

  it('keeps the stored model identifier when a local modelId imports a different model', async () => {
    const existingModel = await MongoAIModel.create(buildStoredLlm('stored-model'));

    const res = await callUpdateWithJson(
      JSON.stringify([
        {
          ...buildLlmConfig({
            modelId: String(existingModel._id),
            model: 'accidental-renamed-model'
          }),
          name: 'Updated display name'
        }
      ])
    );

    expect(res.code).toBe(200);
    await expect(MongoAIModel.findById(existingModel._id).lean()).resolves.toMatchObject({
      model: 'stored-model',
      name: 'Updated display name',
      isActive: true,
      config: { maxContext: 16000 }
    });
    await expect(
      MongoAIModel.findOne({ model: 'accidental-renamed-model' }).lean()
    ).resolves.toBeNull();
  });

  it('ignores an imported type when a local modelId already exists', async () => {
    const existingModel = await MongoAIModel.create(buildStoredLlm('stored-model'));

    const res = await callUpdateWithJson(
      JSON.stringify([
        {
          ...buildLlmConfig({ modelId: String(existingModel._id), model: 'accidental-model' }),
          type: ModelTypeEnum.embedding,
          name: 'Imported as another type'
        }
      ])
    );

    expect(res.code).toBe(200);
    await expect(MongoAIModel.findById(existingModel._id).lean()).resolves.toMatchObject({
      model: 'stored-model',
      type: ModelTypeEnum.llm,
      name: 'Imported as another type',
      config: { maxContext: 16000 }
    });
    expect(configMocks.updatedReloadSystemModel).toHaveBeenCalledOnce();
  });

  it('clears omitted optional fields when replacing a local model config', async () => {
    const existingModel = await MongoAIModel.create({
      ...buildStoredLlm('stored-model'),
      requestUrl: 'https://old.example.com/v1',
      requestAuth: 'old-secret',
      testMode: true,
      charsPointsPrice: 8,
      inputPrice: 2,
      outputPrice: 3,
      priceTiers: [{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }]
    });

    const res = await callUpdateWithJson(
      JSON.stringify([buildLlmConfig({ modelId: String(existingModel._id) })])
    );

    expect(res.code).toBe(200);
    const updated = await MongoAIModel.findById(existingModel._id).lean();
    expect(updated).not.toHaveProperty('requestUrl');
    expect(updated).not.toHaveProperty('requestAuth');
    expect(updated).not.toHaveProperty('testMode');
    expect(updated).not.toHaveProperty('charsPointsPrice');
    expect(updated).not.toHaveProperty('inputPrice');
    expect(updated).not.toHaveProperty('outputPrice');
    expect(updated?.priceTiers).toEqual([]);
  });

  it('uses the stored model identifier when a local modelId omits model', async () => {
    const existingModel = await MongoAIModel.create(buildStoredLlm('stored-model'));
    const { model: _model, ...configWithoutModel } = buildLlmConfig({
      modelId: String(existingModel._id)
    });

    const res = await callUpdateWithJson(
      JSON.stringify([{ ...configWithoutModel, name: 'Updated without model' }])
    );

    expect(res.code).toBe(200);
    await expect(MongoAIModel.findById(existingModel._id).lean()).resolves.toMatchObject({
      model: 'stored-model',
      name: 'Updated without model',
      config: { maxContext: 16000 }
    });
  });

  it('requires model when modelId does not match a local model', async () => {
    const { model: _model, ...configWithoutModel } = buildLlmConfig({ modelId: 'external-id' });

    const res = await callUpdateWithJson(JSON.stringify([configWithoutModel]));

    expect(res.error?.name).toBe('UserError');
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
    expect(configMocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });

  it('ignores old records without modelId and does not disable all models', async () => {
    const existing = await MongoAIModel.create(buildStoredLlm('existing-model'));
    const res = await callUpdateWithJson(
      JSON.stringify([{ ...buildStoredLlm('legacy-model'), scope: undefined }])
    );

    expect(res.code).toBe(200);
    await expect(MongoAIModel.findById(existing._id).lean()).resolves.toMatchObject({
      isActive: true
    });
    await expect(MongoAIModel.findOne({ model: 'legacy-model' })).resolves.toBeNull();
  });

  it('reuses a target model ID when an external ID points to an existing provider model', async () => {
    const existing = await MongoAIModel.create({
      ...buildStoredLlm('test-llm'),
      requestAuth: 'stale-secret',
      charsPointsPrice: 5
    });
    const res = await callUpdateWithJson(
      JSON.stringify([buildLlmConfig({ modelId: 'another-system-id' })])
    );

    expect(res.code).toBe(200);
    const updated = await MongoAIModel.findOne({ model: 'test-llm' }).lean();
    expect(String(updated?._id)).toBe(String(existing._id));
    expect(updated?.config.maxContext).toBe(16000);
    expect(updated).not.toHaveProperty('requestAuth');
    expect(updated).not.toHaveProperty('charsPointsPrice');
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

    expect(res.error?.name).toBe('UserError');
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
});
