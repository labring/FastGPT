import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { createFakeChangeStream, type FakeChangeStream } from '@test/utils/changeStream';

const mocks = vi.hoisted(() => {
  const streams: unknown[] = [];
  return {
    streams,
    generateQA: vi.fn(),
    generateRebuildIndex: vi.fn(),
    generateRebuildSynonym: vi.fn(),
    generatePreCreatedData: vi.fn(),
    datasetParseQueue: vi.fn(),
    trainingWindowOpen: true
  };
});

vi.mock('@fastgpt/service/core/dataset/training/schema', () => ({
  MongoDatasetTraining: {
    watch: vi.fn(() => {
      const stream = createFakeChangeStream();
      mocks.streams.push(stream);
      return stream;
    })
  }
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
vi.mock('@/service/core/dataset/training/schedule', () => ({
  isDatasetTrainingWindowOpen: () => mocks.trainingWindowOpen
}));

import {
  createDatasetTrainingMongoWatch,
  startTrainingQueue
} from '@/service/core/dataset/training/utils';

const streamAt = (index: number) => mocks.streams[index] as FakeChangeStream;

describe('createDatasetTrainingMongoWatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.streams.length = 0;
    mocks.trainingWindowOpen = true;
  });

  it('按训练模式唤醒对应队列，非 insert 事件不触发', async () => {
    createDatasetTrainingMongoWatch();
    const stream = streamAt(0);

    stream.emit('change', { operationType: 'insert', fullDocument: { mode: TrainingModeEnum.qa } });
    await vi.waitFor(() => expect(mocks.generateQA).toHaveBeenCalledOnce());

    stream.emit('change', {
      operationType: 'insert',
      fullDocument: { mode: TrainingModeEnum.index }
    });
    await vi.waitFor(() => expect(mocks.generatePreCreatedData).toHaveBeenCalledOnce());

    stream.emit('change', {
      operationType: 'insert',
      fullDocument: { mode: TrainingModeEnum.rebuildIndex }
    });
    await vi.waitFor(() => expect(mocks.generateRebuildIndex).toHaveBeenCalledOnce());
    expect(mocks.generateRebuildSynonym).not.toHaveBeenCalled();
    stream.emit('change', {
      operationType: 'insert',
      fullDocument: { mode: TrainingModeEnum.rebuildSynonym }
    });
    await vi.waitFor(() => expect(mocks.generateRebuildSynonym).toHaveBeenCalledOnce());

    stream.emit('change', {
      operationType: 'insert',
      fullDocument: { mode: TrainingModeEnum.parse }
    });
    await vi.waitFor(() => expect(mocks.datasetParseQueue).toHaveBeenCalledOnce());

    stream.emit('change', { operationType: 'delete' });
    stream.emit('change', { operationType: 'update' });
    await Promise.resolve();

    expect(mocks.generateQA).toHaveBeenCalledOnce();
    expect(mocks.generateRebuildIndex).toHaveBeenCalledOnce();
    expect(mocks.generatePreCreatedData).toHaveBeenCalledOnce();
    expect(mocks.datasetParseQueue).toHaveBeenCalledOnce();
  });

  it('流终止后自动重建游标，训练事件继续被处理', async () => {
    vi.useFakeTimers();
    createDatasetTrainingMongoWatch();
    expect(mocks.streams).toHaveLength(1);

    // 队列有每分钟的兜底 cron，重连不再额外补偿，只需保证流恢复。
    streamAt(0).emit('close');
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.streams).toHaveLength(2);

    streamAt(1).emit('change', {
      operationType: 'insert',
      fullDocument: { mode: TrainingModeEnum.index }
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.generatePreCreatedData).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe('startTrainingQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trainingWindowOpen = true;
  });

  it('does not wake workers outside the configured training window', () => {
    mocks.trainingWindowOpen = false;

    startTrainingQueue();

    expect(mocks.generateQA).not.toHaveBeenCalled();
    expect(mocks.generateRebuildIndex).not.toHaveBeenCalled();
    expect(mocks.generateRebuildSynonym).not.toHaveBeenCalled();
    expect(mocks.generatePreCreatedData).not.toHaveBeenCalled();
    expect(mocks.datasetParseQueue).not.toHaveBeenCalled();
  });

  it('wakes every worker while the training window is open', () => {
    startTrainingQueue();

    expect(mocks.generateQA).toHaveBeenCalledOnce();
    expect(mocks.generateRebuildIndex).toHaveBeenCalledOnce();
    expect(mocks.generateRebuildSynonym).toHaveBeenCalledOnce();
    expect(mocks.generatePreCreatedData).toHaveBeenCalledOnce();
    expect(mocks.datasetParseQueue).toHaveBeenCalledOnce();
  });
});
