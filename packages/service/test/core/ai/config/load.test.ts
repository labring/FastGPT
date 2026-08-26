import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const pluginMocks = vi.hoisted(() => ({ listModels: vi.fn() }));
const reloadMocks = vi.hoisted(() => ({
  clearAllMyModelsCache: vi.fn(),
  updateFastGPTConfigBuffer: vi.fn(),
  delay: vi.fn()
}));

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

import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { LegacySystemModelCollectionName } from '@fastgpt/service/core/ai/config/constants';
import {
  loadInstalledModels,
  loadSystemModels,
  updatedReloadSystemModel,
  waitForAIModelsBootstrap
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

describe('loadSystemModels', () => {
  const legacyCollection = MongoAIModel.db.collection(LegacySystemModelCollectionName);

  beforeEach(async () => {
    pluginMocks.listModels.mockReset().mockResolvedValue([]);
    reloadMocks.clearAllMyModelsCache.mockReset().mockResolvedValue(undefined);
    reloadMocks.updateFastGPTConfigBuffer.mockReset().mockResolvedValue(undefined);
    reloadMocks.delay.mockReset().mockResolvedValue(undefined);
    await Promise.all([MongoAIModel.deleteMany({}), legacyCollection.deleteMany({})]);
    global.systemModelList = undefined as never;
    global.systemActiveModelList = undefined as never;
    global.systemModelMap = undefined as never;
    global.systemDefaultModel = undefined as never;
  });

  it('publishes the empty target first, then migrates legacy data without changing it', async () => {
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
    await waitForAIModelsBootstrap();

    expect(global.systemModelList).toMatchObject([
      { modelId: String(legacy.insertedId), model: 'legacy-llm' }
    ]);
    await expect(MongoAIModel.findById(legacy.insertedId).lean()).resolves.toMatchObject({
      scope: 'system',
      config: { maxContext: 32000 }
    });
    await expect(legacyCollection.findOne({ _id: legacy.insertedId })).resolves.not.toHaveProperty(
      'scope'
    );
  });

  it('does not partially migrate when any legacy model is invalid', async () => {
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

    await loadSystemModels();
    await expect(waitForAIModelsBootstrap()).rejects.toThrow('Invalid legacy system model');
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
    await expect(MongoAIModel.findOne({ model: pluginLlm.model })).resolves.toBeNull();
    await expect(legacyCollection.countDocuments()).resolves.toBe(2);
    expect(global.systemModelList).toEqual([]);
    expect(reloadMocks.updateFastGPTConfigBuffer).not.toHaveBeenCalled();
  });

  it('blocks startup before publishing a cache when the plugin request fails', async () => {
    pluginMocks.listModels.mockRejectedValue(new Error('plugin unavailable'));

    await expect(loadSystemModels()).rejects.toThrow('plugin unavailable');
    expect(global.systemModelList).toBeUndefined();
  });

  it('preinstalls templates after an empty legacy migration succeeds', async () => {
    pluginMocks.listModels.mockResolvedValue([pluginLlm]);

    await expect(legacyCollection.countDocuments()).resolves.toBe(0);

    await loadSystemModels();
    await waitForAIModelsBootstrap();

    await expect(MongoAIModel.findOne({ model: 'plugin-llm' }).lean()).resolves.toBeTruthy();
    expect(global.systemModelList).toMatchObject([{ model: 'plugin-llm' }]);
  });

  it('skips legacy migration when ai_models already contains data', async () => {
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
    await waitForAIModelsBootstrap();

    await expect(MongoAIModel.findOne({ model: 'legacy-llm' })).resolves.toBeNull();
    expect(global.systemModelList).toMatchObject([{ model: 'installed-llm' }]);
  });

  it('does not inspect legacy data during a template hot refresh', async () => {
    await loadSystemModels();
    await waitForAIModelsBootstrap();
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
    await waitForAIModelsBootstrap();
    reloadMocks.clearAllMyModelsCache.mockClear();

    await loadSystemModels(true);

    expect(reloadMocks.clearAllMyModelsCache).not.toHaveBeenCalled();
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

  it('reloads caches after an admin update', async () => {
    await updatedReloadSystemModel({ pluginDocuments: [] });

    expect(reloadMocks.updateFastGPTConfigBuffer).toHaveBeenCalledOnce();
    expect(reloadMocks.delay).toHaveBeenCalledWith(1000);
  });
});
