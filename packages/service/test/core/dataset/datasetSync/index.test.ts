import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetWorker, mockEnqueue } = vi.hoisted(() => ({
  mockGetWorker: vi.fn(),
  mockEnqueue: vi.fn()
}));

vi.mock('@fastgpt/dal/redis/bullmq', () => ({
  datasetSyncMQService: { getWorker: mockGetWorker }
}));

vi.mock('@fastgpt/service/core/dataset/datasetPermissionSync', () => ({
  enqueueDatasetPermissionSync: mockEnqueue
}));

import { getDatasetSyncWorker } from '@fastgpt/service/core/dataset/datasetSync';

/** 取出包装后的 processor；包装逻辑本身不依赖 BullMQ。 */
const getWrappedProcessor = () => {
  const wrapped = mockGetWorker.mock.calls[0][0] as (
    job: { data: { datasetId: string } },
    token?: string
  ) => Promise<unknown>;
  return wrapped;
};

describe('getDatasetSyncWorker permission sync enqueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueue.mockResolvedValue(undefined);
  });

  it('enqueues a permission sync after a successful dataset sync', async () => {
    const processor = vi.fn().mockResolvedValue('done');
    getDatasetSyncWorker(processor);

    const job = { data: { datasetId: 'dataset-1' } };
    await expect(getWrappedProcessor()(job, 'token')).resolves.toBe('done');

    expect(processor).toHaveBeenCalledWith(job, 'token');
    expect(mockEnqueue).toHaveBeenCalledWith({ datasetId: 'dataset-1' });
  });

  it('enqueues after a failed sync and rethrows the original error', async () => {
    const error = new Error('sync failed');
    getDatasetSyncWorker(vi.fn().mockRejectedValue(error));

    await expect(getWrappedProcessor()({ data: { datasetId: 'dataset-1' } })).rejects.toBe(error);
    expect(mockEnqueue).toHaveBeenCalledWith({ datasetId: 'dataset-1' });
  });
});
