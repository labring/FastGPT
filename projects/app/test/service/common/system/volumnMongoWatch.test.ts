import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';

const mocks = vi.hoisted(() => ({ training: vi.fn(), templateWatch: vi.fn() }));

vi.mock('@/service/core/dataset/training/utils', () => ({
  createDatasetTrainingMongoWatch: mocks.training
}));
vi.mock('@fastgpt/service/core/app/templates/templateSchema', () => ({
  MongoAppTemplate: { watch: mocks.templateWatch }
}));

import { startMongoWatch } from '@/service/common/system/volumnMongoWatch';

describe('startMongoWatch', () => {
  let stop: (() => Promise<void>) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.training.mockImplementation(() => ({ close: vi.fn().mockResolvedValue(undefined) }));
  });
  afterEach(async () => {
    await stop?.();
    stop = undefined;
    vi.restoreAllMocks();
  });

  it('只监听训练，不再监听系统配置、模型目录和模板', async () => {
    const configWatch = vi.spyOn(MongoSystemInstanceConfig, 'watch');
    const modelWatch = vi.spyOn(MongoAIModel, 'watch');
    const catalogWatch = vi.spyOn(MongoAIModelCatalog, 'watch');

    stop = await startMongoWatch();

    expect(mocks.training).toHaveBeenCalledOnce();
    expect(mocks.templateWatch).not.toHaveBeenCalled();
    expect(configWatch).not.toHaveBeenCalled();
    expect(modelWatch).not.toHaveBeenCalled();
    expect(catalogWatch).not.toHaveBeenCalled();
  });

  it('重启时关闭旧训练监听，返回的清理函数可关闭当前监听', async () => {
    await startMongoWatch();
    const previous = mocks.training.mock.results[0].value;
    stop = await startMongoWatch();
    const current = mocks.training.mock.results[1].value;

    expect(previous.close).toHaveBeenCalledOnce();
    expect(current.close).not.toHaveBeenCalled();

    await stop();
    stop = undefined;
    expect(current.close).toHaveBeenCalledOnce();
  });
});
