import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { createFakeChangeStream, type FakeChangeStream } from '@test/utils/changeStream';

const mocks = vi.hoisted(() => {
  const streams: unknown[] = [];
  return {
    streams,
    generateQA: vi.fn(),
    generateVector: vi.fn(),
    datasetParseQueue: vi.fn()
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
vi.mock('@/service/core/dataset/queues/generateVector', () => ({
  generateVector: mocks.generateVector
}));
vi.mock('@/service/core/dataset/queues/datasetParse', () => ({
  datasetParseQueue: mocks.datasetParseQueue
}));

import { createDatasetTrainingMongoWatch } from '@/service/core/dataset/training/utils';

const streamAt = (index: number) => mocks.streams[index] as FakeChangeStream;

describe('createDatasetTrainingMongoWatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.streams.length = 0;
  });

  it('按训练模式唤醒对应队列，非 insert 事件不触发', async () => {
    createDatasetTrainingMongoWatch();
    const stream = streamAt(0);

    stream.emit('change', { operationType: 'insert', fullDocument: { mode: TrainingModeEnum.qa } });
    await vi.waitFor(() => expect(mocks.generateQA).toHaveBeenCalledOnce());

    stream.emit('change', {
      operationType: 'insert',
      fullDocument: { mode: TrainingModeEnum.chunk }
    });
    await vi.waitFor(() => expect(mocks.generateVector).toHaveBeenCalledOnce());

    stream.emit('change', {
      operationType: 'insert',
      fullDocument: { mode: TrainingModeEnum.parse }
    });
    await vi.waitFor(() => expect(mocks.datasetParseQueue).toHaveBeenCalledOnce());

    stream.emit('change', { operationType: 'delete' });
    stream.emit('change', { operationType: 'update' });
    await Promise.resolve();

    expect(mocks.generateQA).toHaveBeenCalledOnce();
    expect(mocks.generateVector).toHaveBeenCalledOnce();
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
      fullDocument: { mode: TrainingModeEnum.chunk }
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.generateVector).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
