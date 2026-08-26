import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const pluginMocks = vi.hoisted(() => ({
  listModels: vi.fn()
}));
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
  pluginClient: {
    listModels: pluginMocks.listModels
  }
}));

vi.mock('@fastgpt/service/common/system/config/controller', () => ({
  reloadFastGPTConfigBuffer: vi.fn(),
  updateFastGPTConfigBuffer: reloadMocks.updateFastGPTConfigBuffer
}));

vi.mock('@fastgpt/service/support/permission/model/controller', () => ({
  clearAllMyModelsCache: reloadMocks.clearAllMyModelsCache
}));

vi.mock('@fastgpt/global/common/system/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/global/common/system/utils')>();
  return {
    ...actual,
    delay: reloadMocks.delay
  };
});

import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { loadSystemModels, updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

describe('loadSystemModels legacy takeover', () => {
  beforeEach(async () => {
    pluginMocks.listModels.mockReset().mockResolvedValue([]);
    reloadMocks.clearAllMyModelsCache.mockReset().mockResolvedValue(undefined);
    reloadMocks.updateFastGPTConfigBuffer.mockReset().mockResolvedValue(undefined);
    reloadMocks.delay.mockReset().mockResolvedValue(undefined);
    await MongoSystemModel.deleteMany({});
    global.systemModelList = undefined as never;
    global.systemActiveModelList = undefined as never;
    global.systemModelMap = undefined as never;
    global.systemDefaultModel = undefined as never;
  });

  it('clears every member model cache after successfully reloading models', async () => {
    await updatedReloadSystemModel();

    expect(reloadMocks.clearAllMyModelsCache).toHaveBeenCalledOnce();
    expect(reloadMocks.updateFastGPTConfigBuffer).toHaveBeenCalledOnce();
    expect(reloadMocks.delay).toHaveBeenCalledWith(1000);
  });

  it('repairs a legacy plugin model in place before materializing missing models', async () => {
    const legacyModel = await MongoSystemModel.collection.insertOne({
      model: 'plugin-llm',
      metadata: {
        type: ModelTypeEnum.llm,
        provider: 'OpenAI',
        name: 'Configured plugin LLM',
        maxContext: 32000,
        maxResponse: 16000,
        quoteMaxToken: 24000,
        isActive: true
      }
    });
    pluginMocks.listModels.mockResolvedValue([
      {
        type: ModelTypeEnum.llm,
        provider: 'OpenAI',
        model: 'plugin-llm',
        name: 'Plugin LLM',
        maxContext: 128000,
        maxTokens: 32000,
        quoteMaxToken: 100000
      }
    ]);

    await expect(loadSystemModels(true)).resolves.toBeUndefined();

    const storedModels = await MongoSystemModel.find({ model: 'plugin-llm' }).lean();
    expect(storedModels).toHaveLength(1);
    expect(String(storedModels[0]._id)).toBe(String(legacyModel.insertedId));
    expect(global.systemModelList[0]).toMatchObject({
      modelId: String(legacyModel.insertedId),
      model: 'plugin-llm',
      name: 'Configured plugin LLM'
    });
  });

  it('rejects startup loading and preserves stored data when the plugin model list fails', async () => {
    const legacyModel = await MongoSystemModel.collection.insertOne({
      model: 'plugin-llm',
      metadata: {}
    });
    pluginMocks.listModels.mockRejectedValue(new Error('plugin unavailable'));

    await expect(loadSystemModels(true)).rejects.toThrow('plugin unavailable');

    await expect(
      MongoSystemModel.collection.findOne({ _id: legacyModel.insertedId })
    ).resolves.toBeTruthy();
    expect(global.systemModelList).toEqual([]);
  });

  it('keeps the previous runtime model cache when a reload cannot fetch plugin models', async () => {
    const previousModels = [
      {
        modelId: '68ad85a7463006c963799a05',
        model: 'previous-model'
      }
    ] as typeof global.systemModelList;
    const previousModelMap = new Map() as typeof global.systemModelMap;
    const previousDefaultModels = {} as typeof global.systemDefaultModel;
    global.systemModelList = previousModels;
    global.systemActiveModelList = previousModels;
    global.systemModelMap = previousModelMap;
    global.systemDefaultModel = previousDefaultModels;
    pluginMocks.listModels.mockRejectedValue(new Error('plugin unavailable'));

    await expect(loadSystemModels(true)).rejects.toThrow('plugin unavailable');

    expect(global.systemModelList).toBe(previousModels);
    expect(global.systemActiveModelList).toBe(previousModels);
    expect(global.systemModelMap).toBe(previousModelMap);
    expect(global.systemDefaultModel).toBe(previousDefaultModels);
  });

  it('repairs legacy models, deletes irreparable models and completes strict loading', async () => {
    const warnSpy = vi
      .spyOn(getLogger(LogCategories.MODULE.AI.CONFIG), 'warn')
      .mockImplementation(() => undefined);
    const inserted = await MongoSystemModel.collection.insertMany([
      {
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
      },
      {
        model: 'invalid-model',
        metadata: { type: 'unknown' }
      }
    ]);

    await expect(loadSystemModels(true)).resolves.toBeUndefined();

    expect(global.systemModelList).toHaveLength(1);
    expect(global.systemModelList[0]).toMatchObject({
      model: 'legacy-llm',
      modelId: expect.any(String),
      config: { maxContext: 32000, maxResponse: 16000, quoteMaxToken: 24000 }
    });
    await expect(
      MongoSystemModel.collection.findOne({ model: 'legacy-llm' })
    ).resolves.toMatchObject({
      metadata: expect.any(Object),
      config: { maxContext: 32000 }
    });
    await expect(
      MongoSystemModel.collection.findOne({ model: 'invalid-model' })
    ).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('Invalid system model documents deleted', {
      deleted: 1,
      models: [
        {
          modelId: String(inserted.insertedIds[1]),
          model: 'invalid-model'
        }
      ]
    });
  });
});
