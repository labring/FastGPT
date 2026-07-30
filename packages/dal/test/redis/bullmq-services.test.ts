import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BullMQBinding } from '@fastgpt/dal/redis/bullmq';
import {
  AppDeleteMQService,
  appDeleteMQService
} from '@fastgpt/dal/redis/bullmq/services/appDelete';
import {
  DatasetSyncMQService,
  datasetSyncMQService
} from '@fastgpt/dal/redis/bullmq/services/datasetSync';

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
      add: vi.fn().mockResolvedValue({ id: 'job-1' })
    };
    const binding = {
      getQueue: vi.fn(() => queue),
      getWorker: vi.fn()
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
    expect(queue.add).toHaveBeenCalledWith('delete_app', data, {
      jobId: 'team-1-app-1',
      delay: 1000
    });
  });
});
