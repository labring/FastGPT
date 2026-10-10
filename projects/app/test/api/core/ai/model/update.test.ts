import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import {
  clearTeamModelCatalogCache,
  publishSystemModelHandle
} from '@fastgpt/service/core/ai/model/catalog/cache';
import { incrementModelCatalogRevision } from '@fastgpt/service/core/ai/model/catalog/entity';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { Call } from '@test/utils/request';
import { getRootUser } from '@test/datas/users';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const configMocks = vi.hoisted(() => ({
  refreshModelTemplates: vi.fn(),
  updatedReloadSystemModel: vi.fn()
}));
const providerMocks = vi.hoisted(() => ({ preloadModelProviders: vi.fn() }));
const channelMocks = vi.hoisted(() => ({
  syncModelNameInChannels: vi.fn(),
  updateModelChannelBindings: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model/channel/binding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/channel/binding')>()),
  syncModelNameInChannels: channelMocks.syncModelNameInChannels,
  updateModelChannelBindings: channelMocks.updateModelChannelBindings
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog/service')>();

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

/** 直接写库的模型必须同步递增目录修订号，否则配置鉴权读取的目录快照中不存在该模型。 */
const insertSystemModel = async (doc: Record<string, unknown>) => {
  const model = await MongoAIModel.create(doc);
  await mongoSessionRun((session) =>
    incrementModelCatalogRevision({ scope: ModelScopeEnum.system }, session)
  );
  return model;
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
  beforeEach(async () => {
    const { mongoSessionRun: actualMongoSessionRun } = await vi.importActual<
      typeof import('@fastgpt/service/common/mongo/sessionRun')
    >('@fastgpt/service/common/mongo/sessionRun');
    // setup 已载入无事务 mock；保留同一个 mock 函数引用，只替换为真实事务实现。
    vi.mocked(mongoSessionRun).mockImplementation(actualMongoSessionRun);
    configMocks.updatedReloadSystemModel.mockReset().mockResolvedValue(undefined);
    configMocks.refreshModelTemplates.mockReset().mockResolvedValue([]);
    providerMocks.preloadModelProviders.mockReset().mockImplementation(async () => {
      global.ModelProviderRawCache = [];
    });
    channelMocks.syncModelNameInChannels.mockReset().mockResolvedValue(undefined);
    channelMocks.updateModelChannelBindings.mockReset().mockResolvedValue(undefined);
    // 丢弃 fixture 目录，配置鉴权从数据库目录快照读取模型。
    publishSystemModelHandle(undefined);
    clearTeamModelCatalogCache();
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
    const model = await insertSystemModel({
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

  it('validates edited config', async () => {
    const existing = await insertSystemModel(buildLlmDocument());
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
    const existing = await insertSystemModel(buildLlmDocument());
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
    const existing = await insertSystemModel(buildLlmDocument());
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
    const existing = await insertSystemModel({
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

  it('accepts and persists a null max temperature', async () => {
    const existing = await insertSystemModel(buildLlmDocument());
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
    const existing = await insertSystemModel(buildLlmDocument());
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
});
