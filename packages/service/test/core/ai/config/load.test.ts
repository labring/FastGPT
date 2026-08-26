import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

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
    listModels: vi.fn().mockResolvedValue([])
  }
}));

import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { loadSystemModels } from '@fastgpt/service/core/ai/config/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

describe('loadSystemModels legacy takeover', () => {
  beforeEach(async () => {
    await MongoSystemModel.deleteMany({});
    global.systemModelList = undefined as never;
    global.systemActiveModelList = undefined as never;
    global.systemModelMap = undefined as never;
    global.systemDefaultModel = undefined as never;
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
