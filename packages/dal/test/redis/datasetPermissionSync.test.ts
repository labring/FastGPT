import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DelayedError } from 'bullmq';
import type { BullMQBinding } from '@fastgpt/dal/redis/bullmq';
import {
  DatasetPermissionSyncMQService,
  getDatasetPermissionSyncJobKey,
  type DatasetPermissionSyncJobData
} from '@fastgpt/dal/redis/bullmq/services/datasetPermissionSync';
import {
  RedisLeaseLostError,
  RedisLeaseUnavailableError,
  type LeaseCache
} from '@fastgpt/dal/redis/caches';
import { QueueNames } from '@fastgpt/dal/redis/bullmq/names';
import { DatasetStatusEnum } from '@fastgpt/global/core/dataset/constants';

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
  data: DatasetPermissionSyncJobData;
  moveToDelayed: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

const createJob = (overrides: Partial<FakeJob> = {}): FakeJob => ({
  id: '10',
  name: 'dataset-1',
  data: { datasetId: 'dataset-1' },
  moveToDelayed: vi.fn().mockResolvedValue(true),
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

const createLeaseCache = (withLease: ReturnType<typeof vi.fn>) =>
  ({ withLease }) as unknown as LeaseCache;

const allowLease = () => vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) => fn());

/** 取出 getWorker 收到的包装后 processor。 */
const getWrappedProcessor = (binding: BullMQBinding) => {
  const getWorkerMock = binding.getWorker as unknown as { mock: { calls: unknown[][] } };
  return getWorkerMock.mock.calls[0][1] as (job: FakeJob, token?: string) => Promise<unknown>;
};

describe('getDatasetPermissionSyncJobKey', () => {
  it('dedups full sync by dataset id', () => {
    expect(getDatasetPermissionSyncJobKey({ datasetId: 'dataset-1' })).toBe('dataset-1');
    expect(getDatasetPermissionSyncJobKey({ datasetId: 'dataset-1', collectionIds: [] })).toBe(
      'dataset-1'
    );
  });

  it('fingerprints targeted syncs independent of id order', () => {
    const a = getDatasetPermissionSyncJobKey({ datasetId: 'd', collectionIds: ['a', 'b'] });
    const b = getDatasetPermissionSyncJobKey({ datasetId: 'd', collectionIds: ['b', 'a'] });
    const c = getDatasetPermissionSyncJobKey({ datasetId: 'd', collectionIds: ['a', 'c'] });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith('d:')).toBe(true);
    expect(a.split(':')[1]).toHaveLength(16);
  });
});

describe('DatasetPermissionSyncMQService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds jobs with the dedup key as both name and deduplication id', async () => {
    const queue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
    const service = new DatasetPermissionSyncMQService(createBinding(queue));

    await service.addJob({ datasetId: 'dataset-1' });

    expect(queue.add).toHaveBeenCalledWith(
      'dataset-1',
      { datasetId: 'dataset-1' },
      {
        deduplication: { id: 'dataset-1' }
      }
    );
  });

  it('reports syncing while an active job for the dataset exists', async () => {
    const queue = {
      getActive: vi.fn().mockResolvedValue([{ data: { datasetId: 'dataset-1' } }]),
      getWaiting: vi.fn().mockResolvedValue([]),
      getDelayed: vi.fn().mockResolvedValue([]),
      getFailed: vi.fn().mockResolvedValue([])
    };
    const service = new DatasetPermissionSyncMQService(createBinding(queue));

    await expect(service.getStatus('dataset-1')).resolves.toEqual({
      status: DatasetStatusEnum.syncing,
      errorMsg: undefined
    });
  });

  it('reports waiting / error / active in order of precedence', async () => {
    const waitingBinding = createBinding({
      getActive: vi.fn().mockResolvedValue([]),
      getWaiting: vi.fn().mockResolvedValue([{ data: { datasetId: 'dataset-1' } }]),
      getDelayed: vi.fn().mockResolvedValue([]),
      getFailed: vi
        .fn()
        .mockResolvedValue([{ data: { datasetId: 'dataset-1' }, failedReason: 'x' }])
    });
    await expect(
      new DatasetPermissionSyncMQService(waitingBinding).getStatus('dataset-1')
    ).resolves.toEqual({ status: DatasetStatusEnum.waiting, errorMsg: undefined });

    const failedBinding = createBinding({
      getActive: vi.fn().mockResolvedValue([]),
      getWaiting: vi.fn().mockResolvedValue([]),
      getDelayed: vi.fn().mockResolvedValue([]),
      getFailed: vi
        .fn()
        .mockResolvedValue([{ data: { datasetId: 'dataset-1' }, failedReason: 'boom' }])
    });
    await expect(
      new DatasetPermissionSyncMQService(failedBinding).getStatus('dataset-1')
    ).resolves.toEqual({ status: DatasetStatusEnum.error, errorMsg: 'boom' });

    const idleBinding = createBinding({
      getActive: vi.fn().mockResolvedValue([{ data: { datasetId: 'other' } }]),
      getWaiting: vi.fn().mockResolvedValue([]),
      getDelayed: vi.fn().mockResolvedValue([]),
      getFailed: vi.fn().mockResolvedValue([])
    });
    await expect(
      new DatasetPermissionSyncMQService(idleBinding).getStatus('dataset-1')
    ).resolves.toEqual({ status: DatasetStatusEnum.active, errorMsg: undefined });
  });

  it('registers the worker with a processor wrapper and single local concurrency', () => {
    const binding = createBinding({ add: vi.fn() });
    const processor = vi.fn();
    new DatasetPermissionSyncMQService(binding).getWorker(processor);

    const [[name, wrappedProcessor, opts]] = (
      binding.getWorker as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls as [[string, unknown, Record<string, unknown>]];

    expect(name).toBe(QueueNames.datasetPermissionSync);
    expect(wrappedProcessor).not.toBe(processor);
    expect(typeof wrappedProcessor).toBe('function');
    expect(opts).toMatchObject({ concurrency: 1 });
  });

  it('runs the processor under the dataset lease, then cleans superseded failures', async () => {
    const failed = createFailedJob({ id: '8', name: 'dataset-1', datasetId: 'dataset-1' });
    const queue = {
      getFailedCount: vi.fn().mockResolvedValue(1),
      getFailed: vi.fn().mockResolvedValue([failed])
    };
    const binding = createBinding(queue);
    const withLease = allowLease();
    const service = new DatasetPermissionSyncMQService(binding, createLeaseCache(withLease));
    const processor = vi.fn().mockResolvedValue('done');
    service.getWorker(processor);

    const job = createJob();
    await expect(getWrappedProcessor(binding)(job, 'token')).resolves.toBe('done');

    expect(withLease).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'dataset-permission-sync:dataset-1',
        ttlMs: 2 * 60 * 1000
      })
    );
    expect(processor).toHaveBeenCalledWith(job, 'token');
    expect(failed.remove).toHaveBeenCalledTimes(1);
  });

  it('delays the job without consuming attempts when the dataset lease is held', async () => {
    const binding = createBinding({});
    const withLease = vi
      .fn()
      .mockRejectedValue(new RedisLeaseUnavailableError({ key: 'k', label: 'l' }));
    const service = new DatasetPermissionSyncMQService(binding, createLeaseCache(withLease));
    const processor = vi.fn();
    service.getWorker(processor);

    const job = createJob();
    await expect(getWrappedProcessor(binding)(job, 'token')).rejects.toBeInstanceOf(DelayedError);

    expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'token');
    expect(processor).not.toHaveBeenCalled();
  });

  it('propagates other lease errors without delaying the job', async () => {
    const binding = createBinding({});
    const withLease = vi.fn().mockRejectedValue(new RedisLeaseLostError({ key: 'k', label: 'l' }));
    const service = new DatasetPermissionSyncMQService(binding, createLeaseCache(withLease));
    service.getWorker(vi.fn());

    const job = createJob();
    await expect(getWrappedProcessor(binding)(job, 'token')).rejects.toBeInstanceOf(
      RedisLeaseLostError
    );
    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });

  it('does not clean failed jobs when the processor throws', async () => {
    const queue = { getFailedCount: vi.fn(), getFailed: vi.fn() };
    const binding = createBinding(queue);
    const service = new DatasetPermissionSyncMQService(binding, createLeaseCache(allowLease()));
    service.getWorker(vi.fn().mockRejectedValue(new Error('boom')));

    await expect(getWrappedProcessor(binding)(createJob(), 'token')).rejects.toThrow('boom');
    expect(queue.getFailedCount).not.toHaveBeenCalled();
  });

  it('clears every failure of the dataset after a successful full sync', async () => {
    const sameKey = createFailedJob({ id: '8', name: 'dataset-1', datasetId: 'dataset-1' });
    const targeted = createFailedJob({ id: '9', name: 'dataset-1:abc', datasetId: 'dataset-1' });
    const otherDataset = createFailedJob({ id: '7', name: 'dataset-2', datasetId: 'dataset-2' });
    const newer = createFailedJob({ id: '11', name: 'dataset-1:def', datasetId: 'dataset-1' });
    const queue = {
      getFailedCount: vi.fn().mockResolvedValue(4),
      getFailed: vi.fn().mockResolvedValue([sameKey, targeted, otherDataset, newer])
    };
    const binding = createBinding(queue);
    const service = new DatasetPermissionSyncMQService(binding, createLeaseCache(allowLease()));
    service.getWorker(vi.fn().mockResolvedValue(undefined));

    await getWrappedProcessor(binding)(
      createJob({ id: '10', name: 'dataset-1', data: { datasetId: 'dataset-1' } }),
      'token'
    );

    expect(queue.getFailed).toHaveBeenCalledWith(0, 3);
    expect(sameKey.remove).toHaveBeenCalledTimes(1);
    expect(targeted.remove).toHaveBeenCalledTimes(1);
    expect(otherDataset.remove).not.toHaveBeenCalled();
    expect(newer.remove).not.toHaveBeenCalled();
  });

  it('clears only same-parameter failures after a successful targeted sync', async () => {
    const sameKey = createFailedJob({ id: '8', name: 'dataset-1:abc', datasetId: 'dataset-1' });
    const otherKey = createFailedJob({ id: '9', name: 'dataset-1:def', datasetId: 'dataset-1' });
    const fullSync = createFailedJob({ id: '7', name: 'dataset-1', datasetId: 'dataset-1' });
    const queue = {
      getFailedCount: vi.fn().mockResolvedValue(3),
      getFailed: vi.fn().mockResolvedValue([sameKey, otherKey, fullSync])
    };
    const binding = createBinding(queue);
    const service = new DatasetPermissionSyncMQService(binding, createLeaseCache(allowLease()));
    service.getWorker(vi.fn().mockResolvedValue(undefined));

    await getWrappedProcessor(binding)(
      createJob({
        id: '10',
        name: 'dataset-1:abc',
        data: { datasetId: 'dataset-1', collectionIds: ['a'] }
      }),
      'token'
    );

    expect(sameKey.remove).toHaveBeenCalledTimes(1);
    expect(otherKey.remove).not.toHaveBeenCalled();
    expect(fullSync.remove).not.toHaveBeenCalled();
  });

  it('skips the failed scan when there is no failure', async () => {
    const queue = { getFailedCount: vi.fn().mockResolvedValue(0), getFailed: vi.fn() };
    const binding = createBinding(queue);
    const service = new DatasetPermissionSyncMQService(binding, createLeaseCache(allowLease()));
    service.getWorker(vi.fn().mockResolvedValue(undefined));

    await getWrappedProcessor(binding)(createJob(), 'token');

    expect(queue.getFailed).not.toHaveBeenCalled();
  });

  it('caps the failed scan at 1000 records', async () => {
    const queue = {
      getFailedCount: vi.fn().mockResolvedValue(10_000),
      getFailed: vi.fn().mockResolvedValue([])
    };
    const binding = createBinding(queue);
    const service = new DatasetPermissionSyncMQService(binding, createLeaseCache(allowLease()));
    service.getWorker(vi.fn().mockResolvedValue(undefined));

    await getWrappedProcessor(binding)(createJob(), 'token');

    expect(queue.getFailed).toHaveBeenCalledWith(0, 999);
  });

  it('keeps the job successful when cleanup fails', async () => {
    const failed = createFailedJob({ id: '8', name: 'dataset-1', datasetId: 'dataset-1' });
    failed.remove.mockRejectedValueOnce(new Error('redis down'));
    const queue = {
      getFailedCount: vi.fn().mockResolvedValue(1),
      getFailed: vi.fn().mockResolvedValue([failed])
    };
    const binding = createBinding(queue);
    const service = new DatasetPermissionSyncMQService(binding, createLeaseCache(allowLease()));
    service.getWorker(vi.fn().mockResolvedValue('done'));

    await expect(getWrappedProcessor(binding)(createJob(), 'token')).resolves.toBe('done');
    expect(binding.logger.warn).toHaveBeenCalledWith(
      '[permissionSync] remove failed job failed',
      expect.objectContaining({ datasetId: 'dataset-1', jobId: '8' })
    );
  });

  it('keeps the job successful when the failed scan throws', async () => {
    const queue = {
      getFailedCount: vi.fn().mockRejectedValue(new Error('redis down')),
      getFailed: vi.fn()
    };
    const binding = createBinding(queue);
    const service = new DatasetPermissionSyncMQService(binding, createLeaseCache(allowLease()));
    service.getWorker(vi.fn().mockResolvedValue('done'));

    await expect(getWrappedProcessor(binding)(createJob(), 'token')).resolves.toBe('done');
    expect(binding.logger.warn).toHaveBeenCalledWith(
      '[permissionSync] remove failed jobs failed',
      expect.objectContaining({ datasetId: 'dataset-1', jobId: '10' })
    );
  });
});
