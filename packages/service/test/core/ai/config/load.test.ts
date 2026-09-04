import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const pluginMocks = vi.hoisted(() => ({ listModels: vi.fn() }));
const reloadMocks = vi.hoisted(() => ({
  clearAllMyModelsCache: vi.fn(),
  updateFastGPTConfigBuffer: vi.fn(),
  delay: vi.fn()
}));
const cronMocks = vi.hoisted(() => ({ setCron: vi.fn() }));

vi.mock('@fastgpt/service/core/app/provider/controller', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/app/provider/controller')>();
  return {
    ...actual,
    preloadModelProviders: vi.fn().mockResolvedValue(undefined),
    getModelProvider: vi.fn((provider: string) => ({
      id: provider,
      name: provider,
      avatar: '/provider.svg',
      order: 0
    }))
  };
});
vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: { listModels: pluginMocks.listModels }
}));
vi.mock('@fastgpt/service/common/system/config/controller', () => ({
  reloadFastGPTConfigBuffer: vi.fn(),
  updateFastGPTConfigBuffer: reloadMocks.updateFastGPTConfigBuffer
}));
vi.mock('@fastgpt/service/support/permission/model/controller', () => ({
  clearAllMyModelsCache: reloadMocks.clearAllMyModelsCache
}));
vi.mock('@fastgpt/global/common/system/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/global/common/system/utils')>()),
  delay: reloadMocks.delay
}));
vi.mock('@fastgpt/service/common/system/cron', () => ({
  setCron: cronMocks.setCron
}));

import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { MongoAIDefaultModel } from '@fastgpt/service/core/ai/defaultModel/schema';
import { LegacySystemModelCollectionName } from '@fastgpt/service/core/ai/config/constants';
import {
  cronRefreshModels,
  loadInstalledModels,
  loadSystemModels,
  syncPreinstalledSystemModels,
  updatedReloadSystemModel
} from '@fastgpt/service/core/ai/config/utils';

const pluginLlm = {
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'plugin-llm',
  name: 'Plugin LLM',
  isActive: true,
  maxContext: 128000,
  maxTokens: 32000,
  quoteMaxToken: 100000
};

const pluginLlmDocument = {
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'plugin-llm',
  name: 'Plugin LLM',
  scope: 'system' as const,
  isActive: true,
  config: { maxContext: 128000, maxResponse: 32000, quoteMaxToken: 100000 }
};

describe('loadSystemModels', () => {
  const legacyCollection = MongoAIModel.db.collection(LegacySystemModelCollectionName);

  beforeEach(async () => {
    pluginMocks.listModels.mockReset().mockResolvedValue([]);
    reloadMocks.clearAllMyModelsCache.mockReset().mockResolvedValue(undefined);
    reloadMocks.updateFastGPTConfigBuffer.mockReset().mockResolvedValue(undefined);
    reloadMocks.delay.mockReset().mockResolvedValue(undefined);
    cronMocks.setCron.mockReset();
    await Promise.all([
      MongoAIModel.deleteMany({}),
      MongoAIDefaultModel.deleteMany({}),
      legacyCollection.deleteMany({})
    ]);
    global.systemModelList = undefined as never;
    global.systemActiveModelList = undefined as never;
    global.systemModelMap = undefined as never;
    global.systemDefaultModel = undefined as never;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshes plugin model templates every thirty minutes', async () => {
    cronRefreshModels();

    expect(cronMocks.setCron).toHaveBeenCalledWith('*/30 * * * *', expect.any(Function));

    const refresh = cronMocks.setCron.mock.calls[0]?.[1];
    expect(refresh).toBeTypeOf('function');
    await refresh?.();
    expect(pluginMocks.listModels).toHaveBeenCalledOnce();
  });

  it('does not run the legacy migration during startup model loading', async () => {
    const legacy = await legacyCollection.insertOne({
      model: 'legacy-llm',
      metadata: {
        type: ModelTypeEnum.llm,
        provider: 'OpenAI',
        name: 'Legacy LLM',
        maxContext: '32000',
        maxResponse: '16000',
        quoteMaxToken: '24000',
        isActive: true
      }
    });

    await loadSystemModels();

    expect(global.systemModelList).toEqual([]);
    await expect(MongoAIModel.findById(legacy.insertedId).lean()).resolves.toBeNull();
    await expect(legacyCollection.findOne({ _id: legacy.insertedId })).resolves.not.toBeNull();
  });

  it('does not inspect invalid legacy records during startup model loading', async () => {
    pluginMocks.listModels.mockResolvedValue([pluginLlm]);
    await legacyCollection.insertMany([
      {
        model: 'legacy-llm',
        metadata: {
          type: ModelTypeEnum.llm,
          provider: 'OpenAI',
          name: 'Legacy LLM',
          maxContext: 32000,
          maxResponse: 16000,
          quoteMaxToken: 24000
        }
      },
      { model: 'invalid-model', metadata: { type: 'unknown' } }
    ]);

    await expect(loadSystemModels()).resolves.toBeUndefined();
    await expect(MongoAIModel.countDocuments()).resolves.toBe(1);
    await expect(MongoAIModel.findOne({ model: pluginLlm.model })).resolves.not.toBeNull();
    await expect(legacyCollection.countDocuments()).resolves.toBe(2);
    expect(global.systemModelList).toMatchObject([{ model: pluginLlm.model }]);
    expect(reloadMocks.updateFastGPTConfigBuffer).not.toHaveBeenCalled();
  });

  it('blocks startup before publishing a cache when the plugin request fails', async () => {
    pluginMocks.listModels.mockRejectedValue(new Error('plugin unavailable'));

    await expect(loadSystemModels()).rejects.toThrow('plugin unavailable');
    expect(global.systemModelList).toBeUndefined();
  });

  it('preinstalls templates during initial model loading', async () => {
    pluginMocks.listModels.mockResolvedValue([pluginLlm]);

    await expect(legacyCollection.countDocuments()).resolves.toBe(0);

    await loadSystemModels();

    await expect(MongoAIModel.findOne({ model: 'plugin-llm' }).lean()).resolves.toBeTruthy();
    expect(global.systemModelList).toMatchObject([{ model: 'plugin-llm' }]);
  });

  it('does not invalidate member model caches during initial startup', async () => {
    pluginMocks.listModels.mockResolvedValue([pluginLlm]);

    await loadSystemModels();

    expect(reloadMocks.clearAllMyModelsCache).not.toHaveBeenCalled();
  });

  it('retries after another instance wins a preinstall duplicate-key race', async () => {
    await MongoAIModel.create(pluginLlmDocument);
    const bulkWrite = vi.spyOn(MongoAIModel, 'bulkWrite').mockRejectedValueOnce({ code: 11000 });

    await expect(
      syncPreinstalledSystemModels({ pluginDocuments: [pluginLlmDocument] })
    ).resolves.toBeUndefined();
    expect(bulkWrite).toHaveBeenCalledTimes(2);
    await expect(MongoAIModel.countDocuments({ model: pluginLlmDocument.model })).resolves.toBe(1);
  });

  it('rethrows the last write error after three retries still fail', async () => {
    const writeError = new Error('write failed');
    const bulkWrite = vi.spyOn(MongoAIModel, 'bulkWrite').mockRejectedValue(writeError);

    await expect(
      syncPreinstalledSystemModels({ pluginDocuments: [pluginLlmDocument] })
    ).rejects.toBe(writeError);
    expect(bulkWrite).toHaveBeenCalledTimes(4);
  });

  it('leaves legacy records untouched when loading existing ai_models data', async () => {
    await MongoAIModel.create({
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'installed-llm',
      name: 'Installed LLM',
      scope: 'system',
      config: { maxContext: 32000, maxResponse: 16000, quoteMaxToken: 24000 }
    });
    await legacyCollection.insertOne({
      model: 'legacy-llm',
      metadata: {
        type: ModelTypeEnum.llm,
        provider: 'OpenAI',
        name: 'Legacy LLM',
        maxContext: 32000,
        maxResponse: 16000,
        quoteMaxToken: 24000
      }
    });

    await loadSystemModels();

    await expect(MongoAIModel.findOne({ model: 'legacy-llm' })).resolves.toBeNull();
    await expect(legacyCollection.countDocuments()).resolves.toBe(1);
    expect(global.systemModelList).toMatchObject([{ model: 'installed-llm' }]);
  });

  it('does not inspect legacy data during a template hot refresh', async () => {
    await loadSystemModels();
    await legacyCollection.insertOne({
      model: 'late-model',
      metadata: {
        type: ModelTypeEnum.llm,
        provider: 'OpenAI',
        name: 'Late model',
        maxContext: 32000,
        maxResponse: 16000,
        quoteMaxToken: 24000
      }
    });

    await loadSystemModels(true);

    await expect(MongoAIModel.findOne({ model: 'late-model' })).resolves.toBeNull();
  });

  it('invalidates member caches only when active model identities change', async () => {
    pluginMocks.listModels.mockResolvedValue([pluginLlm]);
    await loadSystemModels();
    reloadMocks.clearAllMyModelsCache.mockClear();

    await loadSystemModels(true);

    expect(reloadMocks.clearAllMyModelsCache).not.toHaveBeenCalled();
  });

  it('invalidates member caches when a hot refresh adds an active model', async () => {
    pluginMocks.listModels.mockResolvedValue([pluginLlm]);
    await loadSystemModels();
    reloadMocks.clearAllMyModelsCache.mockClear();

    pluginMocks.listModels.mockResolvedValue([
      pluginLlm,
      {
        ...pluginLlm,
        model: 'plugin-llm-2',
        name: 'Plugin LLM 2'
      }
    ]);

    await loadSystemModels(true);

    expect(reloadMocks.clearAllMyModelsCache).toHaveBeenCalledOnce();
  });

  it('loads installed models without requesting plugin templates', async () => {
    const model = await MongoAIModel.create({
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'installed-llm',
      name: 'Installed LLM',
      scope: 'system',
      isActive: true,
      config: { maxContext: 32000, maxResponse: 16000, quoteMaxToken: 24000 }
    });

    await loadInstalledModels({ pluginDocuments: [] });

    expect(pluginMocks.listModels).not.toHaveBeenCalled();
    expect(global.systemModelList).toMatchObject([
      { modelId: String(model._id), model: 'installed-llm', isCustom: true }
    ]);
  });

  it('rejects a database model whose type conflicts with a same-name plugin template', async () => {
    await MongoAIModel.create({
      type: ModelTypeEnum.embedding,
      provider: 'OpenAI',
      model: pluginLlmDocument.model,
      name: 'Conflicting embedding',
      scope: 'system',
      isActive: true,
      config: { defaultToken: 512, maxToken: 8192, weight: 100 }
    });

    await expect(loadInstalledModels({ pluginDocuments: [pluginLlmDocument] })).rejects.toThrow(
      'System model type does not match plugin template'
    );
  });

  it('accepts a database model when one of multiple same-name templates matches its type', async () => {
    await MongoAIModel.create(pluginLlmDocument);

    await expect(
      loadInstalledModels({
        pluginDocuments: [
          pluginLlmDocument,
          {
            type: ModelTypeEnum.embedding,
            provider: 'OpenAI',
            model: pluginLlmDocument.model,
            name: 'Same-name embedding',
            scope: 'system',
            isActive: true,
            config: { defaultToken: 512, maxToken: 8192, weight: 100 }
          }
        ]
      })
    ).resolves.toBeUndefined();
  });

  it('orders all cached models by the plugin array and derives the active list', async () => {
    const pluginModels = [
      {
        type: ModelTypeEnum.llm,
        provider: 'OpenAI',
        model: 'plugin-first',
        name: 'Plugin first',
        isActive: true,
        config: { maxContext: 128000, maxResponse: 32000, quoteMaxToken: 100000 }
      },
      {
        type: ModelTypeEnum.llm,
        provider: 'OpenAI',
        model: 'plugin-second',
        name: 'Plugin second',
        isActive: false,
        config: { maxContext: 128000, maxResponse: 32000, quoteMaxToken: 100000 }
      },
      {
        type: ModelTypeEnum.llm,
        provider: 'OpenAI',
        model: 'plugin-third',
        name: 'Plugin third',
        isActive: true,
        config: { maxContext: 128000, maxResponse: 32000, quoteMaxToken: 100000 }
      }
    ];
    await MongoAIModel.create([
      { ...pluginModels[2], scope: 'system' },
      { ...pluginModels[1], scope: 'system' },
      { ...pluginModels[0], scope: 'system' },
      {
        ...pluginModels[0],
        model: 'custom-model',
        name: 'Custom model',
        scope: 'system'
      }
    ]);

    await loadInstalledModels({ pluginDocuments: pluginModels });

    expect(global.systemModelList.map((model) => model.model)).toEqual([
      'plugin-first',
      'plugin-second',
      'plugin-third',
      'custom-model'
    ]);
    expect(global.systemActiveModelList.map((model) => model.model)).toEqual([
      'plugin-first',
      'plugin-third',
      'custom-model'
    ]);
  });

  it('loads configured system defaults from ai_default_models', async () => {
    const model = await MongoAIModel.create({
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'configured-default-llm',
      name: 'Configured default LLM',
      scope: 'system',
      isActive: true,
      config: { maxContext: 32000, maxResponse: 16000, quoteMaxToken: 24000 }
    });
    await MongoAIDefaultModel.create({
      scope: 'system',
      defaultModelIds: { llm: String(model._id) }
    });

    await loadInstalledModels({ pluginDocuments: [] });

    expect(global.systemConfiguredDefaultModelIds).toEqual({ llm: String(model._id) });
    expect(global.systemDefaultModel.llm?.modelId).toBe(String(model._id));
  });

  it('reloads the model catalog without changing the system init buffer', async () => {
    await updatedReloadSystemModel({ pluginDocuments: [] });

    expect(reloadMocks.updateFastGPTConfigBuffer).not.toHaveBeenCalled();
    expect(reloadMocks.delay).toHaveBeenCalledWith(1000);
  });
});
