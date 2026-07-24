import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrRequeueFailedJob, type Job, type Queue } from '@fastgpt/service/common/bullmq';
import { RedisLeaseUnavailableError } from '@fastgpt/service/common/redis/lock';

type TestJobData = { id: string };

describe('addOrRequeueFailedJob', () => {
  const getJob = vi.fn();
  const add = vi.fn();
  const queue = { name: 'test-queue', getJob, add } as unknown as Queue<TestJobData>;

  beforeEach(() => {
    getJob.mockReset();
    add.mockReset();
  });

  it('adds a new job when the stable job ID does not exist', async () => {
    const addedJob = { id: 'job-1' } as Job<TestJobData>;
    getJob.mockResolvedValue(null);
    add.mockResolvedValue(addedJob);

    await expect(
      addOrRequeueFailedJob({
        queue,
        name: 'test',
        data: { id: 'data-1' },
        opts: { jobId: 'job-1' }
      })
    ).resolves.toBe(addedJob);

    expect(add).toHaveBeenCalledWith('test', { id: 'data-1' }, { jobId: 'job-1' });
  });

  it('recreates a job removed between getJob and getState', async () => {
    const staleJob = {
      getState: vi.fn().mockResolvedValue('unknown')
    } as unknown as Job<TestJobData>;
    const replacementJob = { id: 'job-1' } as Job<TestJobData>;
    getJob.mockResolvedValueOnce(staleJob).mockResolvedValueOnce(null);
    add.mockResolvedValue(replacementJob);

    await expect(
      addOrRequeueFailedJob({
        queue,
        name: 'test',
        data: { id: 'fresh-data' },
        opts: { jobId: 'job-1' }
      })
    ).resolves.toBe(replacementJob);

    expect(add).toHaveBeenCalledWith('test', { id: 'fresh-data' }, { jobId: 'job-1' });
  });

  it('does not report a retained job with an unconfirmed unknown state as queued', async () => {
    const unknownJob = {
      getState: vi.fn().mockResolvedValue('unknown')
    } as unknown as Job<TestJobData>;
    getJob.mockResolvedValue(unknownJob);

    await expect(
      addOrRequeueFailedJob({
        queue,
        name: 'test',
        data: { id: 'fresh-data' },
        opts: { jobId: 'job-1' }
      })
    ).rejects.toThrow('BullMQ job is in an unknown state: test-queue/job-1');

    expect(add).not.toHaveBeenCalled();
  });

  it('updates and retries a retained failed job without deleting its recovery point', async () => {
    const updateData = vi.fn().mockResolvedValue(undefined);
    const retry = vi.fn().mockResolvedValue(undefined);
    const failedJob = {
      getState: vi.fn().mockResolvedValue('failed'),
      updateData,
      retry
    } as unknown as Job<TestJobData>;
    getJob.mockResolvedValue(failedJob);

    await expect(
      addOrRequeueFailedJob({
        queue,
        name: 'test',
        data: { id: 'fresh-data' },
        opts: { jobId: 'job-1', delay: 1000 }
      })
    ).resolves.toBe(failedJob);

    expect(updateData).toHaveBeenCalledWith({ id: 'fresh-data' });
    expect(retry).toHaveBeenCalledWith('failed');
    expect(add).not.toHaveBeenCalled();
  });

  it('keeps an unfinished job without adding a duplicate', async () => {
    const waitingJob = {
      getState: vi.fn().mockResolvedValue('waiting'),
      updateData: vi.fn(),
      retry: vi.fn()
    } as unknown as Job<TestJobData>;
    getJob.mockResolvedValue(waitingJob);

    await expect(
      addOrRequeueFailedJob({
        queue,
        name: 'test',
        data: { id: 'data-1' },
        opts: { jobId: 'job-1' }
      })
    ).resolves.toBe(waitingJob);

    expect(waitingJob.updateData).not.toHaveBeenCalled();
    expect(waitingJob.retry).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('does not hide an update error while the retained job is still failed', async () => {
    const error = new Error('redis unavailable');
    const failedJob = {
      getState: vi.fn().mockResolvedValue('failed'),
      updateData: vi.fn().mockRejectedValue(error),
      retry: vi.fn()
    } as unknown as Job<TestJobData>;
    getJob.mockResolvedValue(failedJob);

    await expect(
      addOrRequeueFailedJob({
        queue,
        name: 'test',
        data: { id: 'data-1' },
        opts: { jobId: 'job-1' }
      })
    ).rejects.toThrow(error);

    expect(failedJob.retry).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('returns the job retried by another producer when retry races', async () => {
    const retryError = new Error('job is not in the failed state');
    const failedJob = {
      getState: vi.fn().mockResolvedValue('failed'),
      updateData: vi.fn().mockResolvedValue(undefined),
      retry: vi.fn().mockRejectedValue(retryError)
    } as unknown as Job<TestJobData>;
    const waitingJob = {
      getState: vi.fn().mockResolvedValue('waiting')
    } as unknown as Job<TestJobData>;
    getJob.mockResolvedValueOnce(failedJob).mockResolvedValueOnce(waitingJob);

    await expect(
      addOrRequeueFailedJob({
        queue,
        name: 'test',
        data: { id: 'data-1' },
        opts: { jobId: 'job-1' }
      })
    ).resolves.toBe(waitingJob);

    expect(add).not.toHaveBeenCalled();
  });

  it('keeps and surfaces a failed job when retry itself fails', async () => {
    const retryError = new Error('redis unavailable');
    const failedJob = {
      getState: vi.fn().mockResolvedValue('failed'),
      updateData: vi.fn().mockResolvedValue(undefined),
      retry: vi.fn().mockRejectedValue(retryError)
    } as unknown as Job<TestJobData>;
    getJob.mockResolvedValue(failedJob);

    await expect(
      addOrRequeueFailedJob({
        queue,
        name: 'test',
        data: { id: 'data-1' },
        opts: { jobId: 'job-1' }
      })
    ).rejects.toThrow(retryError);

    expect(add).not.toHaveBeenCalled();
  });

  it('recreates the job if retention cleanup removes it during recovery', async () => {
    const updateError = new Error('job no longer exists');
    const failedJob = {
      getState: vi.fn().mockResolvedValue('failed'),
      updateData: vi.fn().mockRejectedValue(updateError),
      retry: vi.fn()
    } as unknown as Job<TestJobData>;
    const replacementJob = { id: 'job-1' } as Job<TestJobData>;
    getJob.mockResolvedValueOnce(failedJob).mockResolvedValueOnce(null);
    add.mockResolvedValue(replacementJob);

    await expect(
      addOrRequeueFailedJob({
        queue,
        name: 'test',
        data: { id: 'fresh-data' },
        opts: { jobId: 'job-1' }
      })
    ).resolves.toBe(replacementJob);

    expect(add).toHaveBeenCalledWith('test', { id: 'fresh-data' }, { jobId: 'job-1' });
    expect(failedJob.retry).not.toHaveBeenCalled();
  });

  it('does not let a concurrent producer overwrite data after another recovery starts', async () => {
    let state = 'failed';
    let releaseUpdate!: () => void;
    const updateStarted = new Promise<void>((resolve) => {
      releaseUpdate = resolve;
    });
    let continueUpdate!: () => void;
    const updateBlocked = new Promise<void>((resolve) => {
      continueUpdate = resolve;
    });
    const updateData = vi.fn(async () => {
      releaseUpdate();
      await updateBlocked;
    });
    const retry = vi.fn(async () => {
      state = 'waiting';
    });
    const failedJob = {
      getState: vi.fn(async () => state),
      updateData,
      retry
    } as unknown as Job<TestJobData>;
    getJob.mockResolvedValue(failedJob);

    const firstRecovery = addOrRequeueFailedJob({
      queue,
      name: 'test',
      data: { id: 'first-data' },
      opts: { jobId: 'job-1' }
    });
    await updateStarted;

    await expect(
      addOrRequeueFailedJob({
        queue,
        name: 'test',
        data: { id: 'second-data' },
        opts: { jobId: 'job-1' }
      })
    ).rejects.toBeInstanceOf(RedisLeaseUnavailableError);

    expect(updateData).toHaveBeenCalledTimes(1);
    expect(updateData).toHaveBeenCalledWith({ id: 'first-data' });
    continueUpdate();
    await expect(firstRecovery).resolves.toBe(failedJob);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
