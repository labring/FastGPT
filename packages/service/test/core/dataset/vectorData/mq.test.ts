import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BullMQBinding } from '@fastgpt/dal/redis/bullmq/binding';
import { VectorRowsUpdateMQService } from '@fastgpt/service/core/dataset/vectorData/mq';

describe('VectorRowsUpdateMQService', () => {
  const client = { eval: vi.fn().mockResolvedValue(1) };
  const queue = {
    addBulk: vi.fn().mockResolvedValue([]),
    setGlobalConcurrency: vi.fn().mockResolvedValue(undefined),
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
    queue.setGlobalConcurrency.mockResolvedValue(undefined);
    client.eval.mockResolvedValue(1);
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
    it('waits for the global limit before creating a local single-concurrency worker', async () => {
      let ready!: () => void;
      queue.setGlobalConcurrency.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            ready = resolve;
          })
      );
      const processor = vi.fn();
      const starting = service.getWorker(processor);
      expect(queue.setGlobalConcurrency).toHaveBeenCalledWith(1);
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
      expect(processor).toHaveBeenCalledWith(job, 'token');
      expect(client.eval.mock.invocationCallOrder[0]).toBeLessThan(
        processor.mock.invocationCallOrder[0]
      );
    });

    it('does not start an unrestricted worker when the global setting fails', async () => {
      queue.setGlobalConcurrency.mockRejectedValueOnce(new Error('offline'));
      await expect(service.getWorker(vi.fn())).rejects.toThrow('offline');
      expect(binding.getWorker).not.toHaveBeenCalled();
    });

    it('does not count when ownership release or job validation fails', async () => {
      const processor = vi.fn();
      await service.getWorker(processor);
      const process = binding.getWorker.mock.calls[0][1];
      client.eval.mockRejectedValueOnce(new Error('offline'));
      await expect(process({ id: '1', data: { teamId: 't' } })).rejects.toThrow('offline');
      await expect(process({ id: '2', data: { teamId: '' } })).rejects.toThrow();
      expect(processor).not.toHaveBeenCalled();
    });
  });
});
