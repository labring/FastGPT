import { afterEach, describe, expect, it, vi } from 'vitest';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { MongoAIDefaultModel } from '@fastgpt/service/core/ai/defaultModel/schema';

const mocks = vi.hoisted(() => {
  const stream = () => ({ on: vi.fn().mockReturnThis(), close: vi.fn() });
  return {
    configStream: stream(),
    datasetStream: stream(),
    templateStream: stream(),
    configWatch: vi.fn(),
    datasetWatch: vi.fn(),
    templateWatch: vi.fn()
  };
});

vi.mock('@fastgpt/service/common/system/config/schema', () => ({
  MongoSystemConfigs: { watch: mocks.configWatch }
}));
vi.mock('@/service/core/dataset/training/utils', () => ({
  createDatasetTrainingMongoWatch: mocks.datasetWatch
}));
vi.mock('@fastgpt/service/core/app/templates/templateSchema', () => ({
  MongoAppTemplate: { watch: mocks.templateWatch }
}));

import { startMongoWatch } from '@/service/common/system/volumnMongoWatch';

afterEach(() => vi.restoreAllMocks());

describe('startMongoWatch', () => {
  it('keeps config, training and template watches without opening model change streams', async () => {
    mocks.configWatch.mockReturnValue(mocks.configStream);
    mocks.datasetWatch.mockReturnValue(mocks.datasetStream);
    mocks.templateWatch.mockReturnValue(mocks.templateStream);
    const modelWatch = vi.spyOn(MongoAIModel, 'watch');
    const defaultsWatch = vi.spyOn(MongoAIDefaultModel, 'watch');

    await startMongoWatch();
    await startMongoWatch();

    for (const watch of [mocks.configWatch, mocks.datasetWatch, mocks.templateWatch]) {
      expect(watch).toHaveBeenCalledTimes(2);
    }
    for (const stream of [mocks.configStream, mocks.datasetStream, mocks.templateStream]) {
      expect(stream.close).toHaveBeenCalledOnce();
    }
    expect(modelWatch).not.toHaveBeenCalled();
    expect(defaultsWatch).not.toHaveBeenCalled();
  });
});
