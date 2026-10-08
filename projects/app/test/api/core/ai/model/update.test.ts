import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { Call } from '@test/utils/request';
import { getRootUser } from '@test/datas/users';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const configMocks = vi.hoisted(() => ({
  refreshModelTemplates: vi.fn(),
  updatedReloadSystemModel: vi.fn()
}));
const providerMocks = vi.hoisted(() => ({ preloadModelProviders: vi.fn() }));
const channelMocks = vi.hoisted(() => ({ syncModelNameInChannels: vi.fn() }));

vi.mock('@fastgpt/service/core/ai/channel/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/channel/service')>()),
  syncModelNameInChannels: channelMocks.syncModelNameInChannels
}));

vi.mock('@fastgpt/service/core/ai/model/catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog')>();

  return {
    ...actual,
    updatedReloadSystemModel: configMocks.updatedReloadSystemModel
  };
});
vi.mock('@fastgpt/service/core/ai/model/template', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/template')>()),
  refreshModelTemplates: configMocks.refreshModelTemplates
}));
vi.mock('@fastgpt/service/core/ai/model/provider/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/provider/controller')>()),
  preloadModelProviders: providerMocks.preloadModelProviders
}));

import createModelApi from '@/pages/api/core/ai/model/create';
import createModelsFromTemplatesApi from '@/pages/api/core/ai/model/createFromTemplates';
import getModelTemplatesApi from '@/pages/api/core/ai/model/templates';
import updateModelApi from '@/pages/api/core/ai/model/update';

const buildLlmDocument = () => ({
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'test-llm',
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

const buildLlmUpdateData = () => {
  const { model: _model, ...modelData } = buildLlmDocument();
  return modelData;
};

const callApi = async ({
  handler,
  body,
  query
}: {
  handler: any;
  body?: unknown;
  query?: unknown;
}) => {
  const root = await getRootUser();
  const normalizedBody =
    body && typeof body === 'object' && !('channelType' in body)
      ? { channelType: 'system', ...(body as Record<string, unknown>) }
      : body;
  const normalizedQuery =
    handler === getModelTemplatesApi && !query ? { channelType: 'system' } : query;
  return Call(handler, { auth: root, body: normalizedBody, query: normalizedQuery });
};

describe('admin settings model create/update api', () => {
  beforeEach(() => {
    configMocks.updatedReloadSystemModel.mockReset().mockResolvedValue(undefined);
    configMocks.refreshModelTemplates.mockReset().mockResolvedValue([]);
    providerMocks.preloadModelProviders.mockReset().mockImplementation(async () => {
      global.ModelProviderRawCache = [];
    });
    channelMocks.syncModelNameInChannels.mockReset().mockResolvedValue(undefined);
  });

  it('creates a custom model through the dedicated create endpoint', async () => {
    const res = await callApi({
      handler: createModelApi,
      body: { modelData: buildLlmDocument() }
    });

    expect(res.error).toBeUndefined();
    expect(res.data?.modelId).toBeTruthy();
    await expect(MongoAIModel.findById(res.data?.modelId).lean()).resolves.toMatchObject({
      model: 'test-llm',
      scope: 'system',
      config: { maxContext: 16000 }
    });
  });

  it('accepts channelIds when creating a model', async () => {
    const res = await callApi({
      handler: createModelApi,
      body: {
        modelData: { ...buildLlmDocument(), model: 'channel-test-llm' },
        channelIds: [1, 2]
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.data?.modelId).toBeTruthy();
    await expect(MongoAIModel.findById(res.data?.modelId).lean()).resolves.toMatchObject({
      model: 'channel-test-llm'
    });
  });

  it('defaults a newly created model to inactive', async () => {
    const modelData = buildLlmDocument();
    delete (modelData as { isActive?: boolean }).isActive;

    const res = await callApi({ handler: createModelApi, body: { modelData } });

    expect(res.error).toBeUndefined();
    await expect(MongoAIModel.findById(res.data?.modelId).lean()).resolves.toMatchObject({
      isActive: false
    });
  });

  it('saves a free LLM tier and removes persisted and submitted legacy prices', async () => {
    const model = await MongoAIModel.create({
      ...buildLlmDocument(),
      inputPrice: 1,
      outputPrice: 3,
      charsPointsPrice: 9
    });
    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(model._id),
        modelData: {
          ...buildLlmUpdateData(),
          inputPrice: 1,
          outputPrice: 3,
          charsPointsPrice: 9,
          priceTiers: [{ minInputTokens: 0, inputPrice: 0, outputPrice: 0 }]
        }
      }
    });
    expect(res.error).toBeUndefined();
    const updated = await MongoAIModel.findById(model._id).lean();
    expect(updated).not.toHaveProperty('inputPrice');
    expect(updated).not.toHaveProperty('outputPrice');
    expect(updated).not.toHaveProperty('charsPointsPrice');
    expect(updated?.priceTiers).toMatchObject([{ inputPrice: 0, outputPrice: 0 }]);
  });

  it('creates an active model with no channel or connection configuration', async () => {
    const res = await callApi({
      handler: createModelApi,
      body: { modelData: buildLlmDocument() }
    });

    expect(res.error).toBeUndefined();
    const created = await MongoAIModel.findById(res.data?.modelId).lean();
    expect(created).toMatchObject({ isActive: true });
    expect(created).not.toHaveProperty('requestUrl');
    expect(created).not.toHaveProperty('requestAuth');
  });

  it('preserves requestUrl and requestAuth across create and update', async () => {
    const created = await callApi({
      handler: createModelApi,
      body: {
        modelData: {
          ...buildLlmDocument(),
          requestUrl: 'https://first.example.com/v1/chat/completions',
          requestAuth: 'first-secret'
        }
      }
    });
    expect(created.error).toBeUndefined();
    await expect(MongoAIModel.findById(created.data?.modelId).lean()).resolves.toMatchObject({
      requestUrl: 'https://first.example.com/v1/chat/completions',
      requestAuth: 'first-secret'
    });

    const updated = await callApi({
      handler: updateModelApi,
      body: {
        modelId: created.data?.modelId,
        modelData: {
          ...buildLlmUpdateData(),
          requestUrl: 'https://second.example.com/v1/chat/completions',
          requestAuth: 'second-secret'
        }
      }
    });

    expect(updated.error).toBeUndefined();
    await expect(MongoAIModel.findById(created.data?.modelId).lean()).resolves.toMatchObject({
      requestUrl: 'https://second.example.com/v1/chat/completions',
      requestAuth: 'second-secret'
    });
  });

  it('creates a second model without overwriting the existing default model document', async () => {
    const existing = await MongoAIModel.create({
      ...buildLlmDocument(),
      model: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash'
    });

    const res = await callApi({ handler: createModelApi, body: { modelData: buildLlmDocument() } });

    expect(res.error).toBeUndefined();
    await expect(MongoAIModel.countDocuments()).resolves.toBe(2);
    await expect(MongoAIModel.findById(existing._id).lean()).resolves.toMatchObject({
      model: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash'
    });
  });

  it('rejects a different type reusing the same model identifier', async () => {
    await MongoAIModel.create(buildLlmDocument());

    const res = await callApi({
      handler: createModelApi,
      body: {
        modelData: {
          type: ModelTypeEnum.embedding,
          provider: 'OpenAI',
          model: buildLlmDocument().model,
          name: 'Conflicting embedding',
          scope: 'system',
          isActive: true,
          config: { defaultToken: 512, maxToken: 8192, weight: 100 }
        }
      }
    });

    expect(res.error).toBeDefined();
    await expect(MongoAIModel.countDocuments()).resolves.toBe(1);
  });

  it('rejects an existing model when creating a duplicate model', async () => {
    await MongoAIModel.create(buildLlmDocument());

    const res = await callApi({
      handler: createModelApi,
      body: { modelData: buildLlmDocument() }
    });

    expect(res.error?.name).toBe('UserError');
    await expect(MongoAIModel.countDocuments()).resolves.toBe(1);
  });

  it('validates edited config', async () => {
    const existing = await MongoAIModel.create(buildLlmDocument());
    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(existing._id),
        modelData: { ...buildLlmUpdateData(), name: '   ' }
      }
    });
    expect(res.error).toBeDefined();
    expect((await MongoAIModel.findById(existing._id).lean())?.name).toBe('Test LLM');
  });

  it('submits edited model config successfully', async () => {
    const existing = await MongoAIModel.create(buildLlmDocument());
    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(existing._id),
        modelData: { ...buildLlmUpdateData(), name: 'Updated alias' }
      }
    });
    expect(res.error).toBeUndefined();
    expect((await MongoAIModel.findById(existing._id).lean())?.name).toBe('Updated alias');
  });

  it('updates an existing model only by modelId', async () => {
    const existing = await MongoAIModel.create(buildLlmDocument());
    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(existing._id),
        modelData: {
          ...buildLlmUpdateData(),
          config: { ...buildLlmDocument().config, maxTemperature: 1.2 }
        }
      }
    });

    expect(res.error).toBeUndefined();
    await expect(MongoAIModel.findById(existing._id).lean()).resolves.toMatchObject({
      config: { maxContext: 16000, maxTemperature: 1.2 }
    });
  });

  it('clears omitted optional model fields instead of keeping stale values', async () => {
    const existing = await MongoAIModel.create({
      ...buildLlmDocument(),
      requestUrl: 'https://old.example.com/v1',
      requestAuth: 'old-secret',
      testMode: true,
      charsPointsPrice: 9,
      inputPrice: 4,
      outputPrice: 5,
      priceTiers: [{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }]
    });

    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(existing._id),
        modelData: buildLlmUpdateData()
      }
    });

    expect(res.error).toBeUndefined();
    const updated = await MongoAIModel.findById(existing._id).lean();
    expect(updated).not.toHaveProperty('requestUrl');
    expect(updated).not.toHaveProperty('requestAuth');
    expect(updated).not.toHaveProperty('testMode');
    expect(updated).not.toHaveProperty('charsPointsPrice');
    expect(updated).not.toHaveProperty('inputPrice');
    expect(updated).not.toHaveProperty('outputPrice');
    expect(updated).not.toHaveProperty('priceTiers');
  });

  it('rejects changing an existing model type through the update endpoint', async () => {
    const existing = await MongoAIModel.create(buildLlmDocument());

    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(existing._id),
        modelData: {
          type: ModelTypeEnum.embedding,
          provider: 'OpenAI',
          name: 'Changed type',
          scope: 'system',
          isActive: true,
          config: { defaultToken: 512, maxToken: 8192, weight: 100 }
        }
      }
    });

    expect(res.error).toMatchObject({
      name: 'UserError',
      message: 'System model type cannot be changed'
    });
    await expect(MongoAIModel.findById(existing._id).lean()).resolves.toMatchObject({
      type: ModelTypeEnum.llm,
      config: { maxContext: 16000 }
    });
    expect(configMocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });

  it('allows changing model identifier by stable modelId, updating database', async () => {
    const existing = await MongoAIModel.create(buildLlmDocument());
    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(existing._id),
        modelData: { ...buildLlmUpdateData(), model: 'renamed-llm' }
      }
    });

    expect(res.error).toBeUndefined();
    await expect(MongoAIModel.findById(existing._id).lean()).resolves.toMatchObject({
      model: 'renamed-llm'
    });
    expect(configMocks.updatedReloadSystemModel).toHaveBeenCalled();
    expect(channelMocks.syncModelNameInChannels).toHaveBeenCalledWith(
      expect.objectContaining({ oldModel: 'test-llm', newModel: 'renamed-llm' })
    );
  });

  it('rejects changing model identifier if new identifier conflicts with another model', async () => {
    const existing1 = await MongoAIModel.create(buildLlmDocument());
    await MongoAIModel.create({
      ...buildLlmDocument(),
      model: 'existing-other-llm',
      name: 'Other'
    });

    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(existing1._id),
        modelData: { ...buildLlmUpdateData(), model: 'existing-other-llm' }
      }
    });

    expect(res.error?.name).toBe('UserError');
    await expect(MongoAIModel.findById(existing1._id).lean()).resolves.toMatchObject({
      model: 'test-llm'
    });
  });

  it('accepts and persists a null max temperature', async () => {
    const existing = await MongoAIModel.create(buildLlmDocument());
    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(existing._id),
        modelData: {
          ...buildLlmUpdateData(),
          config: { ...buildLlmDocument().config, maxTemperature: null }
        }
      }
    });

    expect(res.error).toBeUndefined();
    await expect(MongoAIModel.findById(existing._id).lean()).resolves.toMatchObject({
      config: { maxTemperature: null }
    });
  });

  it('rejects non-canonical values instead of repairing them', async () => {
    const existing = await MongoAIModel.create(buildLlmDocument());
    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(existing._id),
        modelData: {
          ...buildLlmUpdateData(),
          config: { ...buildLlmDocument().config, maxTemperature: '1.2' }
        }
      }
    });

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    const unchanged = await MongoAIModel.findById(existing._id).lean();
    expect(unchanged?.config).toMatchObject({ maxContext: 16000, maxResponse: 8000 });
    expect(unchanged?.config).not.toHaveProperty('maxTemperature');
  });

  it('rejects update requests without modelId', async () => {
    const res = await callApi({
      handler: updateModelApi,
      body: { modelData: buildLlmUpdateData() }
    });

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects a non-ObjectId modelId at the API boundary', async () => {
    const res = await callApi({
      handler: updateModelApi,
      body: { modelId: 'not-an-object-id', modelData: buildLlmUpdateData() }
    });

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
  });

  it('ignores a client-provided modelId when creating a model', async () => {
    const clientModelId = '68ad85a7463006c963799a05';
    const res = await callApi({
      handler: createModelApi,
      body: { modelData: { ...buildLlmDocument(), modelId: clientModelId } }
    });

    expect(res.error).toBeUndefined();
    expect(res.data?.modelId).not.toBe(clientModelId);
    await expect(MongoAIModel.countDocuments()).resolves.toBe(1);
    expect(configMocks.updatedReloadSystemModel).toHaveBeenCalledTimes(1);
  });

  it('rejects the whole template batch when a selected template disappeared', async () => {
    configMocks.refreshModelTemplates.mockResolvedValue([buildLlmDocument()]);

    const res = await callApi({
      handler: createModelsFromTemplatesApi,
      body: {
        templates: [
          { type: ModelTypeEnum.llm, model: 'test-llm' },
          { type: ModelTypeEnum.llm, model: 'removed-llm' }
        ]
      }
    });

    expect(res.error?.name).toBe('UserError');
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
  });

  it('pulls model templates again for every templates request', async () => {
    configMocks.refreshModelTemplates.mockResolvedValue([buildLlmDocument()]);

    const first = await callApi({ handler: getModelTemplatesApi, body: undefined });
    const second = await callApi({ handler: getModelTemplatesApi, body: undefined });

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(configMocks.refreshModelTemplates).toHaveBeenCalledTimes(2);
    expect(providerMocks.preloadModelProviders).toHaveBeenCalledTimes(2);
  });

  it('returns model templates sorted by provider order', async () => {
    const providers = [
      {
        provider: 'OpenAI',
        value: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
        avatar: 'model/openai'
      },
      {
        provider: 'Claude',
        value: { en: 'Claude', 'zh-CN': 'Claude', 'zh-Hant': 'Claude' },
        avatar: 'model/claude'
      },
      {
        provider: 'Gemini',
        value: { en: 'Gemini', 'zh-CN': 'Gemini', 'zh-Hant': 'Gemini' },
        avatar: 'model/gemini'
      }
    ];
    providerMocks.preloadModelProviders.mockImplementation(async () => {
      global.ModelProviderRawCache = providers;
    });

    configMocks.refreshModelTemplates.mockResolvedValue([
      { ...buildLlmDocument(), model: 'claude-3-5-sonnet', provider: 'Claude' },
      { ...buildLlmDocument(), model: 'gpt-4o', provider: 'OpenAI' },
      { ...buildLlmDocument(), model: 'gemini-1.5', provider: 'Gemini' },
      { ...buildLlmDocument(), model: 'gpt-4o-mini', provider: 'OpenAI' },
      { ...buildLlmDocument(), model: 'custom-model', provider: 'Unknown' }
    ]);

    const res = await callApi({ handler: getModelTemplatesApi, body: undefined });

    expect(res.error).toBeUndefined();
    expect(res.data.models.map((item: any) => item.model)).toEqual([
      'gpt-4o',
      'gpt-4o-mini',
      'claude-3-5-sonnet',
      'gemini-1.5',
      'custom-model'
    ]);
  });

  it('uses the latest template values, filters installed models, and creates inactive models', async () => {
    await MongoAIModel.create(buildLlmDocument());
    configMocks.refreshModelTemplates.mockResolvedValue([
      buildLlmDocument(),
      { ...buildLlmDocument(), model: 'new-llm', name: 'Latest template name' }
    ]);

    const res = await callApi({
      handler: createModelsFromTemplatesApi,
      body: {
        templates: [
          { type: ModelTypeEnum.llm, model: 'test-llm' },
          { type: ModelTypeEnum.llm, model: 'new-llm' }
        ]
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.data?.models).toHaveLength(1);
    await expect(MongoAIModel.findOne({ model: 'new-llm' }).lean()).resolves.toMatchObject({
      name: 'Latest template name',
      isActive: false
    });
  });

  it('rolls back the whole Mongo batch on a concurrent unique-model conflict', async () => {
    const firstTemplate = { ...buildLlmDocument(), model: 'batch-first' };
    const conflictingTemplate = { ...buildLlmDocument(), model: 'batch-conflict' };
    configMocks.refreshModelTemplates.mockResolvedValue([firstTemplate, conflictingTemplate]);

    const originalInsertMany = MongoAIModel.insertMany;
    vi.spyOn(MongoAIModel, 'insertMany').mockImplementationOnce(async (docs, options) => {
      await MongoAIModel.create(conflictingTemplate);
      return originalInsertMany.call(MongoAIModel, docs, options);
    });

    const res = await callApi({
      handler: createModelsFromTemplatesApi,
      body: {
        templates: [
          { type: ModelTypeEnum.llm, model: 'batch-first' },
          { type: ModelTypeEnum.llm, model: 'batch-conflict' }
        ]
      }
    });

    expect(res.error).toBeDefined();
    await expect(MongoAIModel.exists({ model: 'batch-first' })).resolves.toBeNull();
    await expect(MongoAIModel.countDocuments({ model: 'batch-conflict' })).resolves.toBe(1);
    expect(configMocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });

  it('rejects attempt to hijack model ownership with tmbId or teamId in modelData', async () => {
    const model = await MongoAIModel.create(buildLlmDocument());
    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(model._id),
        modelData: {
          ...buildLlmUpdateData(),
          tmbId: '68ad85a7463006c963799a05'
        }
      }
    });
    expect(res.error).toBeDefined();
  });
});
