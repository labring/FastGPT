import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BullMQBinding } from '@fastgpt/dal/redis/bullmq';
import {
  DatasetSyncMQService,
  type DatasetSyncJobData
} from '@fastgpt/dal/redis/bullmq/services/datasetSync';
import { QueueNames } from '@fastgpt/dal/redis/bullmq/names';

const createBinding = (queue: Record<string, unknown>) => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const binding = {
    getQueue: vi.fn(() => queue),
    getWorker: vi.fn(),
    getLogger: vi.fn(() => logger)
  } as unknown as BullMQBinding;
  return Object.assign(binding, { logger });
};

type FakeJob = {
  id: string;
  name: string;
  data: DatasetSyncJobData;
  remove: ReturnType<typeof vi.fn>;
};

const createJob = (overrides: Partial<FakeJob> = {}): FakeJob => ({
  id: '10',
  name: 'dataset-1',
  data: { datasetId: 'dataset-1' },
  remove: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

const createFailedJob = ({
  id,
  name,
  datasetId
}: {
  id: string;
  name: string;
  datasetId: string;
}) => ({
  id,
  name,
  data: { datasetId },
  remove: vi.fn().mockResolvedValue(undefined)
});

/** 取出 getWorker 收到的包装后 processor。 */
const getWrappedProcessor = (binding: BullMQBinding) => {
  const getWorkerMock = binding.getWorker as unknown as { mock: { calls: unknown[][] } };
  return getWorkerMock.mock.calls[0][1] as (job: FakeJob, token?: string) => Promise<unknown>;
};

describe('DatasetSyncMQService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the worker with a processor wrapper and single local concurrency', () => {
    const binding = createBinding({});
    const processor = vi.fn();
    new DatasetSyncMQService(binding).getWorker(processor);

    const [[name, wrappedProcessor, opts]] = (
      binding.getWorker as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls as [[string, unknown, Record<string, unknown>]];

    expect(name).toBe(QueueNames.datasetSync);
    expect(wrappedProcessor).not.toBe(processor);
    expect(typeof wrappedProcessor).toBe('function');
    expect(opts).toMatchObject({ concurrency: 1 });
  });

  it('runs the processor, then clears older failures of the same dataset', async () => {
    const sameDataset = createFailedJob({ id: '8', name: 'dataset-1', datasetId: 'dataset-1' });
    const otherDataset = createFailedJob({ id: '9', name: 'dataset-2', datasetId: 'dataset-2' });
    const newer = createFailedJob({ id: '11', name: 'dataset-1', datasetId: 'dataset-1' });
    const queue = {
      getFailedCount: vi.fn().mockResolvedValue(3),
      getFailed: vi.fn().mockResolvedValue([sameDataset, otherDataset, newer])
    };
    const binding = createBinding(queue);
    const processor = vi.fn().mockResolvedValue('done');
    new DatasetSyncMQService(binding).getWorker(processor);

    const job = createJob();
    await expect(getWrappedProcessor(binding)(job, 'token')).resolves.toBe('done');

    expect(processor).toHaveBeenCalledWith(job, 'token');
    expect(queue.getFailed).toHaveBeenCalledWith(0, 2);
    expect(sameDataset.remove).toHaveBeenCalledTimes(1);
    expect(otherDataset.remove).not.toHaveBeenCalled();
    expect(newer.remove).not.toHaveBeenCalled();
  });

  it('does not clean failed jobs when the processor throws', async () => {
    const queue = { getFailedCount: vi.fn(), getFailed: vi.fn() };
    const binding = createBinding(queue);
    new DatasetSyncMQService(binding).getWorker(vi.fn().mockRejectedValue(new Error('boom')));

    await expect(getWrappedProcessor(binding)(createJob(), 'token')).rejects.toThrow('boom');
    expect(queue.getFailedCount).not.toHaveBeenCalled();
  });

  it('skips the failed scan when there is no failure', async () => {
    const queue = { getFailedCount: vi.fn().mockResolvedValue(0), getFailed: vi.fn() };
    const binding = createBinding(queue);
    new DatasetSyncMQService(binding).getWorker(vi.fn().mockResolvedValue('done'));

    await expect(getWrappedProcessor(binding)(createJob(), 'token')).resolves.toBe('done');
    expect(queue.getFailed).not.toHaveBeenCalled();
  });

  it('caps the failed scan at 1000 records', async () => {
    const queue = {
      getFailedCount: vi.fn().mockResolvedValue(10_000),
      getFailed: vi.fn().mockResolvedValue([])
    };
    const binding = createBinding(queue);
    new DatasetSyncMQService(binding).getWorker(vi.fn().mockResolvedValue('done'));

    await getWrappedProcessor(binding)(createJob(), 'token');
    expect(queue.getFailed).toHaveBeenCalledWith(0, 999);
  });

  it('keeps the job successful when a failed record cannot be removed', async () => {
    const failed = createFailedJob({ id: '8', name: 'dataset-1', datasetId: 'dataset-1' });
    failed.remove.mockRejectedValueOnce(new Error('redis down'));
    const queue = {
      getFailedCount: vi.fn().mockResolvedValue(1),
      getFailed: vi.fn().mockResolvedValue([failed])
    };
    const binding = createBinding(queue);
    new DatasetSyncMQService(binding).getWorker(vi.fn().mockResolvedValue('done'));

    await expect(getWrappedProcessor(binding)(createJob(), 'token')).resolves.toBe('done');
    expect(binding.logger.warn).toHaveBeenCalledWith(
      '[datasetSync] remove failed job failed',
      expect.objectContaining({ datasetId: 'dataset-1', jobId: '8' })
    );
  });

  it('keeps the job successful when the failed scan throws', async () => {
    const queue = {
      getFailedCount: vi.fn().mockRejectedValue(new Error('redis down')),
      getFailed: vi.fn()
    };
    const binding = createBinding(queue);
    new DatasetSyncMQService(binding).getWorker(vi.fn().mockResolvedValue('done'));

    await expect(getWrappedProcessor(binding)(createJob(), 'token')).resolves.toBe('done');
    expect(binding.logger.warn).toHaveBeenCalledWith(
      '[datasetSync] remove failed jobs failed',
      expect.objectContaining({ datasetId: 'dataset-1', jobId: '10' })
    );
  });
});
