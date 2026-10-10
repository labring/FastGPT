import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  getCachedSystemModelHandle,
  publishSystemModelHandle
} from '@fastgpt/service/core/ai/model/catalog/cache';
import * as modelEntity from '@fastgpt/service/core/ai/model/catalog/entity';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import { runModelTransaction } from '@fastgpt/service/core/ai/model/catalog/transaction';
import { preloadModelProviders } from '@fastgpt/service/core/ai/model/provider/controller';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { getModelTestDefaults, setModelTestSnapshot } from '@test/modelCache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const pluginMocks = vi.hoisted(() => ({ listModels: vi.fn() }));
const reloadMocks = vi.hoisted(() => ({
  updateFastGPTConfigBuffer: vi.fn(),
  delay: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model/provider/controller', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/ai/model/provider/controller')>();
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
vi.mock('@fastgpt/global/common/system/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/global/common/system/utils')>()),
  delay: reloadMocks.delay
}));

import {
  loadInstalledModels,
  loadSystemModels,
  refreshModelHandle,
  updatedReloadSystemModel
} from '@fastgpt/service/core/ai/model/catalog/service';

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
  beforeEach(async () => {
    pluginMocks.listModels.mockReset().mockResolvedValue([]);
    vi.mocked(preloadModelProviders).mockReset().mockResolvedValue(undefined);
    reloadMocks.updateFastGPTConfigBuffer.mockReset().mockResolvedValue(undefined);
    reloadMocks.delay.mockReset().mockResolvedValue(undefined);
    await Promise.all([MongoAIModel.deleteMany({}), MongoAIModelCatalog.deleteMany({})]);
    publishSystemModelHandle(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not request model templates while reloading installed models', async () => {
    await expect(loadSystemModels()).resolves.toBeUndefined();
    expect(pluginMocks.listModels).not.toHaveBeenCalled();
    expect(getCachedSystemModelHandle()?.getAllModels()).toEqual([]);
  });

  it('rejects startup when required Plugin Provider metadata cannot be loaded', async () => {
    const failure = new Error('Plugin Provider unavailable');
    await MongoAIModel.create(pluginLlmDocument);
    vi.mocked(preloadModelProviders).mockRejectedValueOnce(failure);

    await expect(loadSystemModels()).rejects.toBe(failure);

    expect(preloadModelProviders).toHaveBeenCalledOnce();
    expect(pluginMocks.listModels).not.toHaveBeenCalled();
    expect(getCachedSystemModelHandle()?.revision).toBeUndefined();
    expect(getCachedSystemModelHandle()?.getAllModels()).toBeUndefined();
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
    expect(getCachedSystemModelHandle()?.getAllModels()).toMatchObject([
      { modelId: String(model._id), model: 'installed-llm' }
    ]);
    expect(getCachedSystemModelHandle()?.getAllModels()?.[0]).not.toHaveProperty('isCustom');
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

    expect(getCachedSystemModelHandle()?.getAllModels()).toHaveLength(1);
    expect(getCachedSystemModelHandle()?.getAllModels()[0].priceTiers).toEqual([]);
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

    expect(getCachedSystemModelHandle()?.getAllModels()).toHaveLength(1);
    expect(getCachedSystemModelHandle()?.getAllModels()[0].priceTiers).toEqual([
      { minInputTokens: 0, inputPrice: 2, outputPrice: 2 }
    ]);
    expect(getCachedSystemModelHandle()?.getActiveModels()).toEqual([]);
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
      getCachedSystemModelHandle()
        ?.getAllModels()
        .map((model) => model.model)
    ).toEqual(['custom-model', 'plugin-third', 'plugin-second', 'plugin-first']);
    expect(
      getCachedSystemModelHandle()
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
    await MongoAIModelCatalog.create({
      scope: 'system',
      defaultModelIds: { llm: String(model._id) }
    });

    await loadInstalledModels();

    expect(getCachedSystemModelHandle()?.configuredDefaultModelIds).toEqual({
      llm: String(model._id)
    });
    expect(getModelTestDefaults().llm?.modelId).toBe(String(model._id));
  });

  it('does not auto-select a vision model when the dataset image default is not configured', async () => {
    await MongoAIModel.create({
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'configured-vision-llm',
      name: 'Configured vision LLM',
      scope: 'system',
      isActive: true,
      config: { maxContext: 32000, maxResponse: 16000, quoteMaxToken: 24000, vision: true }
    });
    await loadInstalledModels();

    expect(getCachedSystemModelHandle()?.configuredDefaultModelIds.datasetImageLLM).toBeUndefined();
    expect(getCachedSystemModelHandle()?.getDefaultModelData('datasetImageLLM')).toBeUndefined();
  });

  it('reloads the model catalog without changing the system init buffer', async () => {
    await updatedReloadSystemModel();

    expect(reloadMocks.updateFastGPTConfigBuffer).not.toHaveBeenCalled();
    expect(reloadMocks.delay).not.toHaveBeenCalled();
    expect(getCachedSystemModelHandle()?.revision).toBe(0);
  });
});

describe('refreshModelHandle', () => {
  beforeEach(async () => {
    await Promise.all([MongoAIModel.deleteMany({}), MongoAIModelCatalog.deleteMany({})]);
    publishSystemModelHandle(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loads the committed revision and its model configuration before resolving', async () => {
    await MongoAIModel.create(pluginLlmDocument);
    await MongoAIModelCatalog.create({ scope: 'system', catalogRevision: 2 });
    setModelTestSnapshot({ revision: 1 });

    await refreshModelHandle();

    expect(getCachedSystemModelHandle()?.revision).toBe(2);
    expect(getCachedSystemModelHandle()?.getAllModels()).toMatchObject([{ model: 'plugin-llm' }]);
  });

  it('keeps the current snapshot when its revision is already current', async () => {
    await MongoAIModel.create(pluginLlmDocument);
    await MongoAIModelCatalog.create({ scope: 'system', catalogRevision: 2 });
    await loadInstalledModels();
    const snapshot = getCachedSystemModelHandle()?.getAllModels();

    await refreshModelHandle();

    expect(getCachedSystemModelHandle()?.getAllModels()).toBe(snapshot);
    expect(getCachedSystemModelHandle()?.revision).toBe(2);
  });

  it('reloads again when an in-flight snapshot predates the revision required by the read barrier', async () => {
    await MongoAIModel.create(pluginLlmDocument);
    await MongoAIModelCatalog.create({ scope: 'system', catalogRevision: 1 });
    const oldSnapshot = await modelEntity.readModelCatalogSnapshot({
      scope: ModelScopeEnum.system
    });
    let releaseOldSnapshot = () => {};
    const oldSnapshotGate = new Promise<void>((resolve) => {
      releaseOldSnapshot = resolve;
    });
    const snapshotReader = vi
      .spyOn(modelEntity, 'readModelCatalogSnapshot')
      .mockImplementationOnce(async () => {
        await oldSnapshotGate;
        return oldSnapshot;
      });
    const inFlightLoad = loadInstalledModels();

    await runModelTransaction({ scope: ModelScopeEnum.system }, async (session) => {
      await MongoAIModel.updateOne(
        { model: 'plugin-llm' },
        { $set: { name: 'Revision two model' } },
        { session }
      );
    });

    const revisionReader = vi.spyOn(modelEntity, 'readModelCatalogRevision');
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
    expect(getCachedSystemModelHandle()?.revision).toBe(2);
    expect(getCachedSystemModelHandle()?.getAllModels()).toMatchObject([
      { model: 'plugin-llm', name: 'Revision two model' }
    ]);
  });

  it('uses the local snapshot after a reload failure without publishing a new revision', async () => {
    await MongoAIModel.create(pluginLlmDocument);
    await MongoAIModelCatalog.create({ scope: 'system', catalogRevision: 1 });
    await loadInstalledModels();
    const snapshot = getCachedSystemModelHandle()?.getAllModels();
    await MongoAIModelCatalog.updateOne({ scope: 'system' }, { $inc: { catalogRevision: 1 } });
    // 持久化的不合法类型使真实目录解析失败，而不是伪造加载器的行为。
    await MongoAIModel.updateOne({ model: 'plugin-llm' }, { $set: { type: 'invalid' } });

    await expect(refreshModelHandle()).resolves.toBeUndefined();

    expect(getCachedSystemModelHandle()?.revision).toBe(1);
    expect(getCachedSystemModelHandle()?.getAllModels()).toBe(snapshot);
  });

  it('immediately falls back on revision read failure, including a valid empty catalog', async () => {
    await loadInstalledModels();
    const snapshot = getCachedSystemModelHandle()?.getAllModels();
    vi.spyOn(modelEntity, 'readModelCatalogRevision').mockRejectedValue(
      new Error('DB unavailable')
    );

    await expect(refreshModelHandle()).resolves.toBeUndefined();
    expect(getCachedSystemModelHandle()?.getAllModels()).toBe(snapshot);
    expect(snapshot).toEqual([]);
    expect(getCachedSystemModelHandle()?.revision).toBe(0);
  });

  it('still rejects a failed initial read without a previously published snapshot', async () => {
    const error = new Error('DB unavailable');
    vi.spyOn(modelEntity, 'readModelCatalogRevision').mockRejectedValue(error);
    await expect(refreshModelHandle()).rejects.toBe(error);
    expect(getCachedSystemModelHandle()?.revision).toBeUndefined();
  });

  it('bounds the combined revision read and shared reload wait to five seconds', async () => {
    await loadInstalledModels();
    const localSnapshot = getCachedSystemModelHandle()?.getAllModels();
    const nextSnapshot = { models: [], defaultModelIds: {}, revision: 1 };
    let completeReload = () => {};
    const gate = new Promise<typeof nextSnapshot>((resolve) => {
      completeReload = () => resolve(nextSnapshot);
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(modelEntity, 'readModelCatalogRevision').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(1), 3000))
    );
    const reader = vi.spyOn(modelEntity, 'readModelCatalogSnapshot').mockReturnValue(gate);
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
      expect(getCachedSystemModelHandle()?.getAllModels()).toBe(localSnapshot);
      expect(getCachedSystemModelHandle()?.revision).toBe(0);
    } finally {
      // race 不取消共享加载；释放后正常发布完整的新版本，避免测试遗留挂起的 single-flight。
      completeReload();
      await loadInstalledModels();
    }
    expect(getCachedSystemModelHandle()?.revision).toBe(1);
    expect(reader).toHaveBeenCalledOnce();
  });

  it('times out a hung revision read without manufacturing an initial snapshot', async () => {
    let releaseRevision = () => {};
    const gate = new Promise<number>((resolve) => {
      releaseRevision = () => resolve(0);
    });
    vi.spyOn(modelEntity, 'readModelCatalogRevision').mockReturnValue(gate);
    vi.spyOn(modelEntity, 'readModelCatalogSnapshot').mockResolvedValue({
      models: [],
      defaultModelIds: {},
      revision: 0
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const request = expect(refreshModelHandle()).rejects.toThrow('Model catalog refresh timed out');
    await vi.advanceTimersByTimeAsync(5000);
    await request;
    expect(getCachedSystemModelHandle()?.revision).toBeUndefined();
    releaseRevision();
    await loadInstalledModels();
  });

  it('does not fail an already committed write and retries at the next read barrier', async () => {
    await MongoAIModelCatalog.create({ scope: 'system', catalogRevision: 1 });
    await MongoAIModel.create({ ...pluginLlmDocument, type: 'invalid' });

    await expect(updatedReloadSystemModel()).resolves.toBeUndefined();
    expect(getCachedSystemModelHandle()?.revision).toBeUndefined();

    await MongoAIModel.updateOne({ model: 'plugin-llm' }, { $set: { type: ModelTypeEnum.llm } });
    await refreshModelHandle();

    expect(getCachedSystemModelHandle()?.revision).toBe(1);
    expect(getCachedSystemModelHandle()?.getAllModels()).toMatchObject([{ model: 'plugin-llm' }]);
  });
});
