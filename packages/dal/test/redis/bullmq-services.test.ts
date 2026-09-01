import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BullMQBinding } from '@fastgpt/dal/redis/bullmq';
import {
  AppDeleteMQService,
  appDeleteMQService
} from '@fastgpt/dal/redis/bullmq/services/appDelete';
import { DatasetDeleteMQService } from '@fastgpt/dal/redis/bullmq/services/datasetDelete';
import {
  DatasetSyncMQService,
  datasetSyncMQService
} from '@fastgpt/dal/redis/bullmq/services/datasetSync';
import { CollectionUpdateMQService } from '@fastgpt/dal/redis/bullmq/services/collectionUpdate';
import { S3FileDeleteMQService } from '@fastgpt/dal/redis/bullmq/services/s3FileDelete';

describe('BullMQ business services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the default MQ singleton lazy until a queue operation is needed', () => {
    expect(appDeleteMQService).toBeInstanceOf(AppDeleteMQService);
    expect(datasetSyncMQService).toBeInstanceOf(DatasetSyncMQService);
  });

  it('allows queue binding injection while keeping queue contracts in the service class', async () => {
    const queue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
      addBulk: vi.fn().mockResolvedValue([{ id: 'job-1' }]),
      getJob: vi.fn().mockResolvedValue(null)
    };
    const binding = {
      getQueue: vi.fn(() => queue),
      getWorker: vi.fn(),
      getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
    } as unknown as BullMQBinding;
    const service = new AppDeleteMQService(binding);
    const data = { teamId: 'team-1', appId: 'app-1' };

    await expect(service.addJob(data)).resolves.toEqual({ id: 'job-1' });
    expect(binding.getQueue).toHaveBeenCalledWith('appDelete', {
      defaultJobOptions: {
        attempts: 10,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: true,
        removeOnFail: { age: 30 * 24 * 60 * 60 }
      }
    });
    expect(queue.add).toHaveBeenCalledWith(
      'delete_app',
      { ...data, jobType: 'root' },
      {
        jobId: 'team-1-app-1',
        delay: 1000
      }
    );
    expect(queue.getJob).toHaveBeenCalledWith('team-1-app-1');
  });

  it('uses a separate stable ID for a single app deletion job', async () => {
    const queue = {
      add: vi.fn().mockResolvedValue({ id: 'job-app-1' }),
      getJob: vi.fn().mockResolvedValue(null)
    };
    const binding = {
      getQueue: vi.fn(() => queue),
      getWorker: vi.fn(),
      getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
    } as unknown as BullMQBinding;
    const service = new AppDeleteMQService(binding);

    await expect(service.addAppJob({ teamId: 'team-1', appId: 'app-1' })).resolves.toEqual({
      id: 'job-app-1'
    });

    expect(queue.add).toHaveBeenCalledWith(
      'delete_app',
      { teamId: 'team-1', appId: 'app-1', jobType: 'app' },
      { jobId: 'app-team-1-app-1' }
    );
    expect(queue.getJob).toHaveBeenCalledWith('app-team-1-app-1');
  });

  it('adds app deletion jobs in chunks of 200', async () => {
    const queue = {
      add: vi.fn(),
      addBulk: vi.fn().mockImplementation(async (jobs) => jobs.map((job: unknown) => job)),
      getJob: vi.fn().mockResolvedValue(null)
    };
    const binding = {
      getQueue: vi.fn(() => queue),
      getWorker: vi.fn(),
      getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
    } as unknown as BullMQBinding;
    const service = new AppDeleteMQService(binding);
    const data = Array.from({ length: 201 }, (_, index) => ({
      teamId: 'team-1',
      appId: `app-${index}`
    }));

    await service.addAppJobs(data);

    expect(queue.addBulk).toHaveBeenCalledTimes(2);
    expect(queue.addBulk.mock.calls[0][0]).toHaveLength(200);
    expect(queue.addBulk.mock.calls[1][0]).toHaveLength(1);
    expect(queue.addBulk.mock.calls[0][0][0]).toEqual({
      name: 'delete_app',
      data: { teamId: 'team-1', appId: 'app-0', jobType: 'app' },
      opts: { jobId: 'app-team-1-app-0' }
    });
    expect(queue.addBulk.mock.calls[1][0][0].opts).toEqual({
      jobId: 'app-team-1-app-200'
    });
  });

  it('uses failed-job recovery for Dataset deletion jobs', async () => {
    const queue = {
      add: vi.fn().mockResolvedValue({ id: 'job-2' }),
      getJob: vi.fn().mockResolvedValue(null)
    };
    const binding = {
      getQueue: vi.fn(() => queue),
      getWorker: vi.fn(),
      getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
    } as unknown as BullMQBinding;
    const service = new DatasetDeleteMQService(binding);
    const data = { teamId: 'team-1', datasetId: 'dataset-1' };

    await expect(service.addJob(data)).resolves.toEqual({ id: 'job-2' });

    expect(queue.getJob).toHaveBeenCalledWith('team-1-dataset-1');
    expect(queue.add).toHaveBeenCalledWith('delete_dataset', data, {
      jobId: 'team-1-dataset-1',
      delay: 1000
    });
  });

  it('configures collection update retries and removes terminal jobs before requeueing', async () => {
    const terminalJob = {
      getState: vi.fn().mockResolvedValue('failed'),
      remove: vi.fn().mockResolvedValue(undefined)
    };
    const queue = {
      add: vi.fn().mockResolvedValue({ id: 'job-2' }),
      getJob: vi.fn().mockResolvedValue(terminalJob)
    };
    const binding = {
      getQueue: vi.fn(() => queue),
      getWorker: vi.fn(),
      getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
    } as unknown as BullMQBinding;
    const service = new CollectionUpdateMQService(binding);
    const data = { teamId: 'team-1', datasetId: 'dataset-1', collectionId: 'collection-1' };

    await expect(service.pushJob(data)).resolves.toBeUndefined();

    expect(binding.getQueue).toHaveBeenCalledWith('collectionUpdate', {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnFail: true
      }
    });
    expect(queue.getJob).toHaveBeenCalledWith('collection-update-collection-1');
    expect(terminalJob.remove).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith('updateCollection', data, {
      jobId: 'collection-update-collection-1',
      delay: 5000
    });
  });

  it('forces terminal failure cleanup on the collection update worker', () => {
    const worker = { name: 'collectionUpdate' };
    const binding = {
      getQueue: vi.fn(),
      getWorker: vi.fn(() => worker),
      getLogger: vi.fn()
    } as unknown as BullMQBinding;
    const service = new CollectionUpdateMQService(binding);
    const processor = vi.fn();

    expect(service.getWorker(processor)).toBe(worker);
    expect(binding.getWorker).toHaveBeenCalledWith('collectionUpdate', processor, {
      concurrency: 3,
      removeOnComplete: { count: 0 },
      removeOnFail: { count: 0 }
    });
  });

  it('rethrows collection update enqueue failures after logging', async () => {
    const error = new Error('queue unavailable');
    const queue = {
      add: vi.fn().mockRejectedValue(error),
      getJob: vi.fn().mockResolvedValue(null)
    };
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const binding = {
      getQueue: vi.fn(() => queue),
      getWorker: vi.fn(),
      getLogger: vi.fn(() => logger)
    } as unknown as BullMQBinding;
    const service = new CollectionUpdateMQService(binding);

    await expect(
      service.pushJob({ teamId: 'team-1', datasetId: 'dataset-1', collectionId: 'collection-1' })
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith('Failed to push collection update job', {
      collectionId: 'collection-1',
      error
    });
  });

  it('treats a concurrent active duplicate as an idempotent enqueue success', async () => {
    const terminalJob = {
      getState: vi.fn().mockResolvedValue('failed'),
      remove: vi.fn().mockResolvedValue(undefined)
    };
    const activeJob = {
      getState: vi.fn().mockResolvedValue('delayed'),
      remove: vi.fn()
    };
    const queue = {
      add: vi.fn().mockRejectedValue(new Error('Job already exists')),
      getJob: vi.fn().mockResolvedValueOnce(terminalJob).mockResolvedValueOnce(activeJob)
    };
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const binding = {
      getQueue: vi.fn(() => queue),
      getWorker: vi.fn(),
      getLogger: vi.fn(() => logger)
    } as unknown as BullMQBinding;
    const service = new CollectionUpdateMQService(binding);

    await expect(
      service.pushJob({ teamId: 'team-1', datasetId: 'dataset-1', collectionId: 'collection-1' })
    ).resolves.toBeUndefined();
    expect(activeJob.remove).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Collection update job already queued', {
      collectionId: 'collection-1',
      state: 'delayed'
    });
  });

  it('uses bucket-qualified encoded job IDs for S3 object and prefix deletions', async () => {
    const queue = { add: vi.fn().mockResolvedValue({ id: 'job-3' }) };
    const binding = {
      getQueue: vi.fn(() => queue),
      getWorker: vi.fn()
    } as unknown as BullMQBinding;
    const service = new S3FileDeleteMQService(binding);

    await service.addJob({ bucketName: 'bucket-a', key: 'folder/a:b.txt' });
    await service.addJob({ bucketName: 'bucket-b', key: 'folder/a:b.txt' });
    await service.addJob({ bucketName: 'bucket-a', prefix: 'folder/a:b/' });
    await service.addJob({ bucketName: 'a-b', key: 'c' });
    await service.addJob({ bucketName: 'a', key: 'b-c' });

    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      'delete-s3-files',
      { bucketName: 'bucket-a', key: 'folder/a:b.txt' },
      expect.objectContaining({ jobId: 's3-key-bucket-a|folder%2Fa%3Ab.txt' })
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      'delete-s3-files',
      { bucketName: 'bucket-b', key: 'folder/a:b.txt' },
      expect.objectContaining({ jobId: 's3-key-bucket-b|folder%2Fa%3Ab.txt' })
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      3,
      'delete-s3-files',
      { bucketName: 'bucket-a', prefix: 'folder/a:b/' },
      expect.objectContaining({ jobId: 's3-prefix-bucket-a|folder%2Fa%3Ab%2F' })
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      4,
      'delete-s3-files',
      { bucketName: 'a-b', key: 'c' },
      expect.objectContaining({ jobId: 's3-key-a-b|c' })
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      5,
      'delete-s3-files',
      { bucketName: 'a', key: 'b-c' },
      expect.objectContaining({ jobId: 's3-key-a|b-c' })
    );
  });
});
