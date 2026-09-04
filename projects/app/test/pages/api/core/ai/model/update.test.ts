import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { Call } from '@test/utils/request';
import { getRootUser } from '@test/datas/users';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const configMocks = vi.hoisted(() => ({
  refreshModelTemplates: vi.fn(),
  updatedReloadSystemModel: vi.fn()
}));
const channelMocks = vi.hoisted(() => ({
  appendModelsToAIProxyChannels: vi.fn(),
  replaceModelInAIProxyChannels: vi.fn()
}));
const providerMocks = vi.hoisted(() => ({ preloadModelProviders: vi.fn() }));

vi.mock('@fastgpt/service/core/ai/config/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/config/utils')>();

  return {
    ...actual,
    refreshModelTemplates: configMocks.refreshModelTemplates,
    updatedReloadSystemModel: configMocks.updatedReloadSystemModel
  };
});
vi.mock('@fastgpt/service/thirdProvider/aiproxy/channel', () => channelMocks);
vi.mock('@fastgpt/service/core/app/provider/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/app/provider/controller')>()),
  preloadModelProviders: providerMocks.preloadModelProviders
}));

import createModelApi from '@/pages/api/admin/settings/model/create';
import createModelsFromTemplatesApi from '@/pages/api/admin/settings/model/createFromTemplates';
import replaceModelChannelsApi from '@/pages/api/admin/settings/model/channel/replace';
import getModelTemplatesApi from '@/pages/api/admin/settings/model/templates';
import updateModelApi from '@/pages/api/admin/settings/model/update';

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

const callApi = async ({ handler, body }: { handler: any; body: unknown }) => {
  const root = await getRootUser();
  return Call(handler, { auth: root, body });
};

describe('admin settings model create/update api', () => {
  beforeEach(() => {
    configMocks.updatedReloadSystemModel.mockReset().mockResolvedValue(undefined);
    configMocks.refreshModelTemplates.mockReset().mockResolvedValue([]);
    channelMocks.appendModelsToAIProxyChannels.mockReset().mockResolvedValue(undefined);
    channelMocks.replaceModelInAIProxyChannels.mockReset().mockResolvedValue(undefined);
    providerMocks.preloadModelProviders.mockReset().mockImplementation(async () => {
      global.ModelProviderRawCache = [];
    });
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

  it('defaults a newly created model to inactive', async () => {
    const modelData = buildLlmDocument();
    delete (modelData as { isActive?: boolean }).isActive;

    const res = await callApi({ handler: createModelApi, body: { modelData } });

    expect(res.error).toBeUndefined();
    await expect(MongoAIModel.findById(res.data?.modelId).lean()).resolves.toMatchObject({
      isActive: false
    });
  });

  it('creates an active model with no channel or connection configuration', async () => {
    const res = await callApi({
      handler: createModelApi,
      body: { modelData: buildLlmDocument(), channelIds: [] }
    });

    expect(res.error).toBeUndefined();
    expect(channelMocks.appendModelsToAIProxyChannels).toHaveBeenCalledWith({
      channelIds: [],
      models: ['test-llm']
    });
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
        },
        channelIds: []
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

  it('binds channels before inserting the new model', async () => {
    channelMocks.appendModelsToAIProxyChannels.mockImplementationOnce(async () => {
      await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
    });

    const res = await callApi({
      handler: createModelApi,
      body: { modelData: buildLlmDocument(), channelIds: [7] }
    });

    expect(res.error).toBeUndefined();
    expect(channelMocks.appendModelsToAIProxyChannels).toHaveBeenCalledWith({
      channelIds: [7],
      models: ['test-llm']
    });
    await expect(MongoAIModel.countDocuments()).resolves.toBe(1);
  });

  it('does not insert a model when channel binding fails', async () => {
    channelMocks.appendModelsToAIProxyChannels.mockRejectedValueOnce(
      new Error('channel update failed')
    );

    const res = await callApi({
      handler: createModelApi,
      body: { modelData: buildLlmDocument(), channelIds: [7] }
    });

    expect(res.error).toBeDefined();
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
    expect(configMocks.updatedReloadSystemModel).not.toHaveBeenCalled();
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

  it('rejects attempts to change the immutable model identifier', async () => {
    const existing = await MongoAIModel.create(buildLlmDocument());
    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(existing._id),
        modelData: { ...buildLlmUpdateData(), model: 'renamed-llm' }
      }
    });

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoAIModel.findById(existing._id).lean()).resolves.toMatchObject({
      model: 'test-llm'
    });
    expect(configMocks.updatedReloadSystemModel).not.toHaveBeenCalled();
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

  it('rejects modelId anywhere in a create model payload', async () => {
    const res = await callApi({
      handler: createModelApi,
      body: { modelData: { ...buildLlmDocument(), modelId: '68ad85a7463006c963799a05' } }
    });

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
    expect(configMocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });

  it('rejects the whole template batch when a selected template disappeared', async () => {
    configMocks.refreshModelTemplates.mockResolvedValue([buildLlmDocument()]);

    const res = await callApi({
      handler: createModelsFromTemplatesApi,
      body: {
        templates: [
          { type: ModelTypeEnum.llm, model: 'test-llm' },
          { type: ModelTypeEnum.llm, model: 'removed-llm' }
        ],
        channelIds: [7]
      }
    });

    expect(res.error?.name).toBe('UserError');
    expect(channelMocks.appendModelsToAIProxyChannels).not.toHaveBeenCalled();
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
        ],
        channelIds: [7]
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.data?.models).toHaveLength(1);
    expect(channelMocks.appendModelsToAIProxyChannels).toHaveBeenCalledWith({
      channelIds: [7],
      models: ['new-llm']
    });
    await expect(MongoAIModel.findOne({ model: 'new-llm' }).lean()).resolves.toMatchObject({
      name: 'Latest template name',
      isActive: false
    });
  });

  it('rolls back the whole Mongo batch on a concurrent unique-model conflict', async () => {
    const firstTemplate = { ...buildLlmDocument(), model: 'batch-first' };
    const conflictingTemplate = { ...buildLlmDocument(), model: 'batch-conflict' };
    const channelModels = new Set<string>();
    configMocks.refreshModelTemplates.mockResolvedValue([firstTemplate, conflictingTemplate]);
    channelMocks.appendModelsToAIProxyChannels.mockImplementationOnce(async ({ models }) => {
      models.forEach((model: string) => channelModels.add(model));
      await MongoAIModel.create(conflictingTemplate);
    });

    const res = await callApi({
      handler: createModelsFromTemplatesApi,
      body: {
        templates: [
          { type: ModelTypeEnum.llm, model: 'batch-first' },
          { type: ModelTypeEnum.llm, model: 'batch-conflict' }
        ],
        channelIds: [7]
      }
    });

    expect(res.error).toBeDefined();
    await expect(MongoAIModel.exists({ model: 'batch-first' })).resolves.toBeNull();
    await expect(MongoAIModel.countDocuments({ model: 'batch-conflict' })).resolves.toBe(1);
    expect([...channelModels]).toEqual(['batch-first', 'batch-conflict']);
    expect(configMocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });

  it('replaces model channels by stable modelId without accepting a renamed identifier', async () => {
    const existing = await MongoAIModel.create(buildLlmDocument());

    const res = await callApi({
      handler: replaceModelChannelsApi,
      body: {
        modelId: String(existing._id),
        channelIds: [2, 7]
      }
    });

    expect(res.error).toBeUndefined();
    expect(channelMocks.replaceModelInAIProxyChannels).toHaveBeenCalledWith({
      model: 'test-llm',
      channelIds: [2, 7]
    });
  });

  it('allows replacing an existing model association with zero channels', async () => {
    const existing = await MongoAIModel.create(buildLlmDocument());

    const res = await callApi({
      handler: replaceModelChannelsApi,
      body: {
        modelId: String(existing._id),
        channelIds: []
      }
    });

    expect(res.error).toBeUndefined();
    expect(channelMocks.replaceModelInAIProxyChannels).toHaveBeenCalledWith({
      model: 'test-llm',
      channelIds: []
    });
  });
});
