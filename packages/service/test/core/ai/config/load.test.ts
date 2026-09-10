import { getCachedModelHandle, publishModelHandle } from '@fastgpt/service/core/ai/config/handle';
import { setModelTestSnapshot, getModelTestDefaults } from '@test/modelCache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

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
import { MongoAIDefaultModel } from '@fastgpt/service/core/ai/defaultModel/schema';
import * as modelEntity from '@fastgpt/service/core/ai/config/entity';
import { preloadModelProviders } from '@fastgpt/service/core/app/provider/controller';
import { LegacySystemModelCollectionName } from '@fastgpt/service/core/ai/config/constants';
import {
  loadInstalledModels,
  loadSystemModels,
  refreshModelHandle,
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
    vi.mocked(preloadModelProviders).mockReset().mockResolvedValue(undefined);
    reloadMocks.clearAllMyModelsCache.mockReset().mockResolvedValue(undefined);
    reloadMocks.updateFastGPTConfigBuffer.mockReset().mockResolvedValue(undefined);
    reloadMocks.delay.mockReset().mockResolvedValue(undefined);
    await Promise.all([
      MongoAIModel.deleteMany({}),
      MongoAIDefaultModel.deleteMany({}),
      legacyCollection.deleteMany({})
    ]);
    publishModelHandle(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    expect(getCachedModelHandle()?.getAllModels()).toEqual([]);
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
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
    await expect(legacyCollection.countDocuments()).resolves.toBe(2);
    expect(getCachedModelHandle()?.getAllModels()).toEqual([]);
    expect(reloadMocks.updateFastGPTConfigBuffer).not.toHaveBeenCalled();
  });

  it('does not request model templates while reloading installed models', async () => {
    await expect(loadSystemModels()).resolves.toBeUndefined();
    expect(pluginMocks.listModels).not.toHaveBeenCalled();
    expect(getCachedModelHandle()?.getAllModels()).toEqual([]);
  });

  it('rejects startup when required Plugin Provider metadata cannot be loaded', async () => {
    const failure = new Error('Plugin Provider unavailable');
    await MongoAIModel.create(pluginLlmDocument);
    vi.mocked(preloadModelProviders).mockRejectedValueOnce(failure);

    await expect(loadSystemModels()).rejects.toBe(failure);

    expect(preloadModelProviders).toHaveBeenCalledOnce();
    expect(pluginMocks.listModels).not.toHaveBeenCalled();
    expect(getCachedModelHandle()?.revision).toBeUndefined();
    expect(getCachedModelHandle()?.getAllModels()).toBeUndefined();
  });

  it('does not preinstall templates during initial model loading', async () => {
    pluginMocks.listModels.mockResolvedValue([pluginLlm]);

    await expect(legacyCollection.countDocuments()).resolves.toBe(0);

    await loadSystemModels();

    await expect(MongoAIModel.findOne({ model: 'plugin-llm' }).lean()).resolves.toBeNull();
    expect(pluginMocks.listModels).not.toHaveBeenCalled();
    expect(getCachedModelHandle()?.getAllModels()).toEqual([]);
  });

  it('does not invalidate member model caches during initial startup', async () => {
    pluginMocks.listModels.mockResolvedValue([pluginLlm]);

    await loadSystemModels();

    expect(reloadMocks.clearAllMyModelsCache).not.toHaveBeenCalled();
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
    expect(getCachedModelHandle()?.getAllModels()).toMatchObject([{ model: 'installed-llm' }]);
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

  it('invalidates member caches when a hot refresh sees a newly installed active model', async () => {
    await loadSystemModels();
    reloadMocks.clearAllMyModelsCache.mockClear();

    await MongoAIModel.create({
      ...pluginLlmDocument,
      model: 'installed-llm-2',
      name: 'Installed LLM 2'
    });

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

    await loadInstalledModels();

    expect(pluginMocks.listModels).not.toHaveBeenCalled();
    expect(getCachedModelHandle()?.getAllModels()).toMatchObject([
      { modelId: String(model._id), model: 'installed-llm' }
    ]);
    expect(getCachedModelHandle()?.getAllModels()?.[0]).not.toHaveProperty('isCustom');
  });

  it('does not synthesize an empty price tier for legacy active models during startup', async () => {
    await MongoAIModel.collection.insertOne({
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'legacy-zero-price-llm',
      name: 'Legacy zero price LLM',
      scope: 'system',
      isActive: true,
      inputPrice: 0,
      outputPrice: 0,
      config: { maxContext: 32000, maxResponse: 16000, quoteMaxToken: 24000 }
    });

    await loadInstalledModels();

    expect(getCachedModelHandle()?.getAllModels()).toHaveLength(1);
    expect(getCachedModelHandle()?.getAllModels()[0].priceTiers).toEqual([]);
  });

  it('resolves inactive legacy model pricing with progressive fallback for admin display', async () => {
    await MongoAIModel.collection.insertOne({
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'inactive-legacy-priced-llm',
      name: 'Inactive legacy priced LLM',
      scope: 'system',
      isActive: false,
      priceTiers: [],
      inputPrice: 0,
      outputPrice: 0,
      charsPointsPrice: 2,
      config: { maxContext: 32000, maxResponse: 16000, quoteMaxToken: 24000 }
    });

    await loadInstalledModels();

    expect(getCachedModelHandle()?.getAllModels()).toHaveLength(1);
    expect(getCachedModelHandle()?.getAllModels()[0].priceTiers).toEqual([
      { minInputTokens: 0, inputPrice: 2, outputPrice: 2 }
    ]);
    expect(getCachedModelHandle()?.getActiveModels()).toEqual([]);
  });

  it('keeps the MongoDB newest-first order and derives the active list', async () => {
    const installedModels = [
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
      { ...installedModels[0], scope: 'system' },
      { ...installedModels[1], scope: 'system' },
      { ...installedModels[2], scope: 'system' },
      {
        ...installedModels[0],
        model: 'custom-model',
        name: 'Custom model',
        scope: 'system'
      }
    ]);

    await loadInstalledModels();

    expect(
      getCachedModelHandle()
        ?.getAllModels()
        .map((model) => model.model)
    ).toEqual(['custom-model', 'plugin-third', 'plugin-second', 'plugin-first']);
    expect(
      getCachedModelHandle()
        ?.getActiveModels()
        .map((model) => model.model)
    ).toEqual(['custom-model', 'plugin-third', 'plugin-first']);
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

    await loadInstalledModels();

    expect(getCachedModelHandle()?.configuredDefaultModelIds).toEqual({ llm: String(model._id) });
    expect(getModelTestDefaults().llm?.modelId).toBe(String(model._id));
  });

  it('reloads the model catalog without changing the system init buffer', async () => {
    await updatedReloadSystemModel();

    expect(reloadMocks.updateFastGPTConfigBuffer).not.toHaveBeenCalled();
    expect(reloadMocks.delay).not.toHaveBeenCalled();
    expect(getCachedModelHandle()?.revision).toBe(0);
  });
});

describe('refreshModelHandle', () => {
  beforeEach(async () => {
    await Promise.all([MongoAIModel.deleteMany({}), MongoAIDefaultModel.deleteMany({})]);
    publishModelHandle(undefined);
    reloadMocks.clearAllMyModelsCache.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loads the committed revision and its model configuration before resolving', async () => {
    await MongoAIModel.create(pluginLlmDocument);
    await MongoAIDefaultModel.create({ scope: 'system', catalogRevision: 2 });
    setModelTestSnapshot({ revision: 1 });

    await refreshModelHandle();

    expect(getCachedModelHandle()?.revision).toBe(2);
    expect(getCachedModelHandle()?.getAllModels()).toMatchObject([{ model: 'plugin-llm' }]);
  });

  it('keeps the current snapshot when its revision is already current', async () => {
    await MongoAIModel.create(pluginLlmDocument);
    await MongoAIDefaultModel.create({ scope: 'system', catalogRevision: 2 });
    await loadInstalledModels();
    const snapshot = getCachedModelHandle()?.getAllModels();

    await refreshModelHandle();

    expect(getCachedModelHandle()?.getAllModels()).toBe(snapshot);
    expect(getCachedModelHandle()?.revision).toBe(2);
  });

  it('reloads again when an in-flight snapshot predates the revision required by the read barrier', async () => {
    await MongoAIModel.create(pluginLlmDocument);
    await MongoAIDefaultModel.create({ scope: 'system', catalogRevision: 1 });
    const oldSnapshot = await modelEntity.readSystemModelSnapshot();
    let releaseOldSnapshot = () => {};
    const oldSnapshotGate = new Promise<void>((resolve) => {
      releaseOldSnapshot = resolve;
    });
    const snapshotReader = vi
      .spyOn(modelEntity, 'readSystemModelSnapshot')
      .mockImplementationOnce(async () => {
        await oldSnapshotGate;
        return oldSnapshot;
      });
    const inFlightLoad = loadInstalledModels();

    await modelEntity.runSystemModelTransaction(async (session) => {
      await MongoAIModel.updateOne(
        { model: 'plugin-llm' },
        { $set: { name: 'Revision two model' } },
        { session }
      );
    });

    const revisionReader = vi.spyOn(modelEntity, 'readSystemModelRevision');
    let barrierFinished = false;
    const barrier = refreshModelHandle().then(() => {
      barrierFinished = true;
    });

    try {
      // 读屏障先于测试 await 注册 continuation；权威读取完成后它已加入旧的在途加载。
      await expect(revisionReader.mock.results[0].value).resolves.toBe(2);
      expect(snapshotReader).toHaveBeenCalledOnce();
      expect(barrierFinished).toBe(false);
    } finally {
      releaseOldSnapshot();
      await Promise.all([inFlightLoad, barrier]);
    }

    expect(snapshotReader).toHaveBeenCalledTimes(2);
    expect(getCachedModelHandle()?.revision).toBe(2);
    expect(getCachedModelHandle()?.getAllModels()).toMatchObject([
      { model: 'plugin-llm', name: 'Revision two model' }
    ]);
  });

  it('uses the local snapshot after a reload failure without publishing a new revision', async () => {
    await MongoAIModel.create(pluginLlmDocument);
    await MongoAIDefaultModel.create({ scope: 'system', catalogRevision: 1 });
    await loadInstalledModels();
    const snapshot = getCachedModelHandle()?.getAllModels();
    await MongoAIDefaultModel.updateOne({ scope: 'system' }, { $inc: { catalogRevision: 1 } });
    // 持久化的不合法类型使真实目录解析失败，而不是伪造加载器的行为。
    await MongoAIModel.updateOne({ model: 'plugin-llm' }, { $set: { type: 'invalid' } });

    await expect(refreshModelHandle()).resolves.toBeUndefined();

    expect(getCachedModelHandle()?.revision).toBe(1);
    expect(getCachedModelHandle()?.getAllModels()).toBe(snapshot);
  });

  it('immediately falls back on revision read failure, including a valid empty catalog', async () => {
    await loadInstalledModels();
    const snapshot = getCachedModelHandle()?.getAllModels();
    vi.spyOn(modelEntity, 'readSystemModelRevision').mockRejectedValue(new Error('DB unavailable'));

    await expect(refreshModelHandle()).resolves.toBeUndefined();
    expect(getCachedModelHandle()?.getAllModels()).toBe(snapshot);
    expect(snapshot).toEqual([]);
    expect(getCachedModelHandle()?.revision).toBe(0);
  });

  it('still rejects a failed initial read without a previously published snapshot', async () => {
    const error = new Error('DB unavailable');
    vi.spyOn(modelEntity, 'readSystemModelRevision').mockRejectedValue(error);
    await expect(refreshModelHandle()).rejects.toBe(error);
    expect(getCachedModelHandle()?.revision).toBeUndefined();
  });

  it('bounds the combined revision read and shared reload wait to five seconds', async () => {
    await loadInstalledModels();
    const localSnapshot = getCachedModelHandle()?.getAllModels();
    const nextSnapshot = { models: [], defaultModelIds: {}, revision: 1 };
    let completeReload = () => {};
    const gate = new Promise<typeof nextSnapshot>((resolve) => {
      completeReload = () => resolve(nextSnapshot);
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(modelEntity, 'readSystemModelRevision').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(1), 3000))
    );
    const reader = vi.spyOn(modelEntity, 'readSystemModelSnapshot').mockReturnValue(gate);
    let done = false;
    const requests = Promise.all([refreshModelHandle(), refreshModelHandle()]).then(() => {
      done = true;
    });
    try {
      await vi.advanceTimersByTimeAsync(4999);
      expect(done).toBe(false);
      expect(reader).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await requests;
      expect(getCachedModelHandle()?.getAllModels()).toBe(localSnapshot);
      expect(getCachedModelHandle()?.revision).toBe(0);
    } finally {
      // race 不取消共享加载；释放后正常发布完整的新版本，避免测试遗留挂起的 single-flight。
      completeReload();
      await loadInstalledModels();
    }
    expect(getCachedModelHandle()?.revision).toBe(1);
    expect(reader).toHaveBeenCalledOnce();
  });

  it('times out a hung revision read without manufacturing an initial snapshot', async () => {
    let releaseRevision = () => {};
    const gate = new Promise<number>((resolve) => {
      releaseRevision = () => resolve(0);
    });
    vi.spyOn(modelEntity, 'readSystemModelRevision').mockReturnValue(gate);
    vi.spyOn(modelEntity, 'readSystemModelSnapshot').mockResolvedValue({
      models: [],
      defaultModelIds: {},
      revision: 0
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const request = expect(refreshModelHandle()).rejects.toThrow('Model catalog refresh timed out');
    await vi.advanceTimersByTimeAsync(5000);
    await request;
    expect(getCachedModelHandle()?.revision).toBeUndefined();
    releaseRevision();
    await loadInstalledModels();
  });

  it('does not fail an already committed write and retries at the next read barrier', async () => {
    await MongoAIDefaultModel.create({ scope: 'system', catalogRevision: 1 });
    await MongoAIModel.create({ ...pluginLlmDocument, type: 'invalid' });

    await expect(updatedReloadSystemModel()).resolves.toBeUndefined();
    expect(getCachedModelHandle()?.revision).toBeUndefined();

    await MongoAIModel.updateOne({ model: 'plugin-llm' }, { $set: { type: ModelTypeEnum.llm } });
    await refreshModelHandle();

    expect(getCachedModelHandle()?.revision).toBe(1);
    expect(getCachedModelHandle()?.getAllModels()).toMatchObject([{ model: 'plugin-llm' }]);
  });
});
