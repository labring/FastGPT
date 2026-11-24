import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
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
  const prevPerformance = { ...getSystemInstanceConfig().performance.dataset };

  beforeEach(() => {
    vi.clearAllMocks();
    global.qaQueueLen = 0;
    global.preCreatedQueueLen = 0;
    global.datasetParseQueueLen = 0;
    global.vectorQueueLen = 0;
    global.synonymQueueLen = 0;
    getSystemInstanceConfig().performance.dataset.qaMaxProcess = 3;
    getSystemInstanceConfig().performance.dataset.vectorMaxProcess = 4;
    getSystemInstanceConfig().performance.dataset.parseMaxProcess = 2;
  });

  let activeSub: ReturnType<typeof subscribeDatasetTrainingQueue> | undefined;
  afterEach(async () => {
    await activeSub?.close();
    activeSub = undefined;
    Object.assign(getSystemInstanceConfig().performance.dataset, prevPerformance);
  });

  it('按 Redis 唤醒信号补满对应开源队列剩余并发槽位，保留重建单并发并忽略商业版模式', async () => {
    global.qaQueueLen = 1; // 3 - 1 = 2 remaining
    global.vectorQueueLen = 1; // 1 - 1 = 0 remaining

    activeSub = subscribeDatasetTrainingQueue();
    await activeSub.ready;

    await publishTrainingWakeup({
      modes: [
        TrainingModeEnum.qa,
        TrainingModeEnum.qa,
        TrainingModeEnum.index,
        TrainingModeEnum.rebuildIndex,
        TrainingModeEnum.rebuildSynonym,
        TrainingModeEnum.parse,
        TrainingModeEnum.auto
      ]
    });

    await vi.waitFor(() => expect(mocks.datasetParseQueue).toHaveBeenCalledTimes(2));
    expect(mocks.generateQA).toHaveBeenCalledTimes(2);
    expect(mocks.generatePreCreatedData).toHaveBeenCalledTimes(4);
    expect(mocks.generateRebuildIndex).not.toHaveBeenCalled();
    expect(mocks.generateRebuildSynonym).toHaveBeenCalledOnce();
  });

  it('单个队列同步抛错或返回拒绝 Promise 时不中断同批次其余模式的槽位唤醒', async () => {
    mocks.generateQA
      .mockImplementationOnce(() => {
        throw new Error('sync boom');
      })
      .mockRejectedValueOnce(new Error('async boom'));

    activeSub = subscribeDatasetTrainingQueue();
    await activeSub.ready;

    await publishTrainingWakeup({
      modes: [TrainingModeEnum.qa, TrainingModeEnum.parse]
    });

    await vi.waitFor(() => expect(mocks.datasetParseQueue).toHaveBeenCalledTimes(2));
    expect(mocks.generateQA).toHaveBeenCalledTimes(3);
  });
});
