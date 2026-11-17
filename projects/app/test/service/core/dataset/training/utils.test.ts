import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { publishTrainingWakeup } from '@fastgpt/service/core/dataset/training/wakeup';

const mocks = vi.hoisted(() => ({
  generateQA: vi.fn(),
  generateRebuildIndex: vi.fn(),
  generateRebuildSynonym: vi.fn(),
  generatePreCreatedData: vi.fn(),
  datasetParseQueue: vi.fn()
}));

vi.mock('@/service/core/dataset/queues/generateQA', () => ({ generateQA: mocks.generateQA }));
vi.mock('@/service/core/dataset/queues/generateRebuildIndex', () => ({
  generateRebuildIndex: mocks.generateRebuildIndex
}));
vi.mock('@/service/core/dataset/queues/generateRebuildSynonym', () => ({
  generateRebuildSynonym: mocks.generateRebuildSynonym
}));
vi.mock('@/service/core/dataset/queues/generatePreCreatedData', () => ({
  generatePreCreatedData: mocks.generatePreCreatedData
}));
vi.mock('@/service/core/dataset/queues/datasetParse', () => ({
  datasetParseQueue: mocks.datasetParseQueue
}));

import { subscribeDatasetTrainingQueue } from '@/service/core/dataset/training/utils';

describe('subscribeDatasetTrainingQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  let activeSub: ReturnType<typeof subscribeDatasetTrainingQueue> | undefined;
  afterEach(async () => {
    await activeSub?.close();
    activeSub = undefined;
  });

  it('按 Redis 唤醒信号拉起对应的开源训练队列并忽略商业版模式', async () => {
    activeSub = subscribeDatasetTrainingQueue();
    await activeSub.ready;

    await publishTrainingWakeup({
      modes: [
        TrainingModeEnum.qa,
        TrainingModeEnum.index,
        TrainingModeEnum.rebuildIndex,
        TrainingModeEnum.rebuildSynonym,
        TrainingModeEnum.parse,
        TrainingModeEnum.auto
      ]
    });

    await vi.waitFor(() => expect(mocks.datasetParseQueue).toHaveBeenCalledOnce());
    expect(mocks.generateQA).toHaveBeenCalledOnce();
    expect(mocks.generatePreCreatedData).toHaveBeenCalledOnce();
    expect(mocks.generateRebuildIndex).toHaveBeenCalledOnce();
    expect(mocks.generateRebuildSynonym).toHaveBeenCalledOnce();
  });
});
