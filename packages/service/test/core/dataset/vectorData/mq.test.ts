import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BullMQBinding } from '@fastgpt/dal/redis/bullmq/binding';
import {
  VectorRowsUpdateMQService,
  notifyVectorRowsChanged,
  vectorRowsUpdateMQService
} from '@fastgpt/service/core/dataset/vectorData/mq';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { Types } from '@fastgpt/service/common/mongo';

describe('VectorRowsUpdateMQService', () => {
  const loggerWarn = vi.spyOn(getLogger(LogCategories.INFRA.QUEUE), 'warn');
  const client = { eval: vi.fn().mockResolvedValue(1) };
  const queue = {
    addBulk: vi.fn().mockResolvedValue([]),
    removeGlobalConcurrency: vi.fn().mockResolvedValue(undefined),
    client: Promise.resolve(client),
    toKey: (key: string) => `test:${key}`
  };
  const binding = {
    getQueue: vi.fn(() => queue),
    getWorker: vi.fn((_name: string, _processor: (...args: any[]) => any, _opts: unknown) => ({
      name: 'vectorRowsUpdate'
    }))
  };
  const service = new VectorRowsUpdateMQService(binding as unknown as BullMQBinding);

  beforeEach(() => {
    vi.clearAllMocks();
    loggerWarn.mockImplementation(() => undefined);
    queue.removeGlobalConcurrency.mockResolvedValue(undefined);
    client.eval.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('pushJobs', () => {
    it('coalesces the team and each unique dataset independently for one minute', async () => {
      await service.pushJobs({ teamId: 't', datasetIds: ['a', 'b', 'a'] });
      const jobs = queue.addBulk.mock.calls[0][0];
      expect(jobs).toEqual([
        {
          name: 'update_vector_rows',
          data: { teamId: 't' },
          opts: { delay: 60_000, deduplication: { id: 'team/t' } }
        },
        {
          name: 'update_vector_rows',
          data: { teamId: 't', datasetId: 'a' },
          opts: { delay: 60_000, deduplication: { id: 'dataset/t/a' } }
        },
        {
          name: 'update_vector_rows',
          data: { teamId: 't', datasetId: 'b' },
          opts: { delay: 60_000, deduplication: { id: 'dataset/t/b' } }
        }
      ]);
    });

    it('supports team-only notifications and rejects empty identities before enqueueing', async () => {
      await service.pushJobs({ teamId: 't' });
      expect(queue.addBulk.mock.calls[0][0]).toHaveLength(1);
      queue.addBulk.mockClear();
      await expect(service.pushJobs({ teamId: '' })).rejects.toThrow();
      await expect(service.pushJobs({ teamId: 't', datasetIds: [''] })).rejects.toThrow();
      expect(queue.addBulk).not.toHaveBeenCalled();
    });
  });

  describe('getWorker', () => {
    it('clears a legacy global limit before starting a node-local single-concurrency worker', async () => {
      let ready!: () => void;
      queue.removeGlobalConcurrency.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            ready = resolve;
          })
      );
      const processor = vi.fn();
      const starting = service.getWorker(processor);
      expect(queue.removeGlobalConcurrency).toHaveBeenCalledOnce();
      expect(binding.getWorker).not.toHaveBeenCalled();
      ready();
      await starting;
      expect(binding.getWorker).toHaveBeenCalledWith('vectorRowsUpdate', expect.any(Function), {
        concurrency: 1,
        removeOnComplete: { count: 0 },
        removeOnFail: { age: 86400, count: 1000 }
      });
      const process = binding.getWorker.mock.calls[0][1];
      const job = { id: 'old-job', data: { teamId: 't', datasetId: 'a' } };
      await process(job, 'token');
      expect(client.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'test:de:dataset/t/a',
        'old-job'
      );
      expect(processor).toHaveBeenCalledWith(job.data, expect.any(AbortSignal));
      expect(processor.mock.calls[0][1].aborted).toBe(true);
      expect(client.eval.mock.invocationCallOrder[0]).toBeLessThan(
        processor.mock.invocationCallOrder[0]
      );
    });

    it('does not start a worker with a stale global limit when cleanup fails', async () => {
      queue.removeGlobalConcurrency.mockRejectedValueOnce(new Error('offline'));
      await expect(service.getWorker(vi.fn())).rejects.toThrow('offline');
      expect(binding.getWorker).not.toHaveBeenCalled();
    });

    it('retries an ownership release failure without counting, but rejects invalid identities', async () => {
      const processor = vi.fn();
      await service.getWorker(processor);
      const process = binding.getWorker.mock.calls[0][1];
      client.eval.mockRejectedValueOnce(new Error('offline'));
      const moveToDelayed = vi.fn().mockResolvedValue(undefined);
      await expect(
        process({ id: '1', data: { teamId: 't' }, attemptsStarted: 1, moveToDelayed }, 'token')
      ).rejects.toMatchObject({ name: 'DelayedError' });
      expect(moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'token');
      await expect(process({ id: '2', data: { teamId: '' } })).rejects.toThrow();
      expect(processor).not.toHaveBeenCalled();
    });

    it('keeps retrying with exponential delay capped at one hour, beyond a finite retry budget', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-10-22T00:00:00Z');
      vi.setSystemTime(now);
      const processor = vi.fn().mockRejectedValue(new Error('database offline'));
      await service.getWorker(processor);
      const process = binding.getWorker.mock.calls[0][1];
      const job = {
        id: 'retry',
        data: { teamId: 't', datasetId: 'a' },
        attemptsStarted: 1,
        moveToDelayed: vi.fn().mockResolvedValue(undefined)
      };

      for (const [attempt, retryDelay] of [
        [1, 60_000],
        [2, 120_000],
        [6, 1_920_000],
        [7, 3_600_000],
        [100_000, 3_600_000]
      ]) {
        job.attemptsStarted = attempt;
        await expect(process(job, 'token')).rejects.toMatchObject({ name: 'DelayedError' });
        expect(job.moveToDelayed).toHaveBeenLastCalledWith(now.getTime() + retryDelay, 'token');
        expect(processor.mock.calls.at(-1)?.[1].aborted).toBe(true);
      }
      expect(vi.getTimerCount()).toBe(0);
    });

    it('lets a newer pending window take over a failure instead of accumulating duplicate retries', async () => {
      client.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
      await service.getWorker(vi.fn().mockRejectedValue(new Error('database offline')));
      const process = binding.getWorker.mock.calls[0][1];
      const job = {
        id: 'old',
        data: { teamId: 't' },
        attemptsStarted: 1,
        moveToDelayed: vi.fn()
      };

      await expect(process(job, 'token')).resolves.toBeUndefined();
      expect(job.moveToDelayed).not.toHaveBeenCalled();
    });

    it('aborts a stalled attempt after sixty seconds and releases it into delayed retry', async () => {
      vi.useFakeTimers();
      let finish!: () => void;
      const processor = vi.fn(
        (_data: unknown, _signal: AbortSignal) =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      );
      await service.getWorker(processor);
      const process = binding.getWorker.mock.calls[0][1];
      const job = {
        id: 'slow',
        data: { teamId: 't' },
        attemptsStarted: 1,
        moveToDelayed: vi.fn().mockResolvedValue(undefined)
      };
      const attempt = expect(process(job, 'token')).rejects.toMatchObject({ name: 'DelayedError' });

      await vi.advanceTimersByTimeAsync(59_999);
      const signal = processor.mock.calls[0][1];
      expect(signal.aborted).toBe(false);
      expect(job.moveToDelayed).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await attempt;
      expect(signal.aborted).toBe(true);
      expect(signal.reason.message).toBe('Vector rows update timed out');
      expect(job.moveToDelayed).toHaveBeenCalledOnce();

      finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(job.moveToDelayed).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('surfaces a failed state transition rather than completing a lost retry', async () => {
      await service.getWorker(vi.fn().mockRejectedValue(new Error('database offline')));
      const process = binding.getWorker.mock.calls[0][1];
      await expect(
        process({
          id: 'retry',
          data: { teamId: 't' },
          attemptsStarted: 1,
          moveToDelayed: vi.fn().mockRejectedValue(new Error('Redis offline'))
        })
      ).rejects.toThrow('Redis offline');
    });
  });
});

describe('notifyVectorRowsChanged', () => {
  const pushJobs = vi.spyOn(vectorRowsUpdateMQService, 'pushJobs');
  const loggerError = vi.spyOn(getLogger(LogCategories.INFRA.QUEUE), 'error');

  beforeEach(() => {
    pushJobs.mockReset().mockResolvedValue([]);
    loggerError.mockReset().mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizes Mongo identities before sending a bounded notification', async () => {
    vi.useFakeTimers();
    const teamId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    // lean 引用的声明类型是 string，但运行时仍可能是 ObjectId。
    await notifyVectorRowsChanged({ teamId, datasetIds: [datasetId] } as unknown as Parameters<
      typeof notifyVectorRowsChanged
    >[0]);
    expect(pushJobs).toHaveBeenCalledWith({
      teamId: String(teamId),
      datasetIds: [String(datasetId)]
    });
    expect(loggerError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('logs MQ failure without rejecting a notification for committed vector data', async () => {
    const error = new Error('Redis unavailable');
    pushJobs.mockRejectedValueOnce(error);
    await expect(
      notifyVectorRowsChanged({ teamId: 't', datasetIds: ['a'] })
    ).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalledWith('Failed to queue vector rows update', {
      teamId: 't',
      datasetIds: ['a'],
      error
    });
  });

  it('stops waiting after three seconds and handles a late delivery failure', async () => {
    vi.useFakeTimers();
    let rejectDelivery!: (error: Error) => void;
    pushJobs.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectDelivery = reject;
      })
    );
    const result = notifyVectorRowsChanged({ teamId: 't', datasetIds: ['a'] });
    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalledWith('Failed to queue vector rows update', {
      teamId: 't',
      datasetIds: ['a'],
      error: expect.objectContaining({ message: 'Vector rows notification timed out' })
    });
    rejectDelivery(new Error('late Redis failure'));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
