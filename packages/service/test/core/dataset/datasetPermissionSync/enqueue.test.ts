import { beforeEach, describe, expect, it, vi } from 'vitest';

const findOne = vi.fn();
const addJob = vi.fn();

vi.mock('@fastgpt/dal/redis/bullmq/services/datasetPermissionSync', () => ({
  datasetPermissionSyncMQService: {
    addJob,
    getStatus: vi.fn(),
    getWorker: vi.fn()
  }
}));
vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: { findOne }
}));
vi.mock('@fastgpt/service/core/dataset/datasetPermissionSync/processor', () => ({
  datasetPermissionSyncProcessor: vi.fn()
}));

const { enqueueDatasetPermissionSync } =
  await import('@fastgpt/service/core/dataset/datasetPermissionSync');

const datasetId = '64b7f4c2f1a2b3c4d5e6f701';
const lean = (row: unknown) => ({ lean: vi.fn().mockResolvedValue(row) });

beforeEach(() => {
  vi.clearAllMocks();
  findOne.mockReturnValue(lean({ apiDatasetServer: { apiServer: {}, permissionSync: true } }));
  addJob.mockResolvedValue(undefined);
});

describe('enqueueDatasetPermissionSync', () => {
  it('enqueues when the dataset exists and permission sync is on', async () => {
    await enqueueDatasetPermissionSync({ datasetId });

    expect(addJob).toHaveBeenCalledWith({ datasetId });
  });

  it('skips unknown datasets and datasets with permission sync off', async () => {
    findOne.mockReturnValueOnce(lean(null));
    await enqueueDatasetPermissionSync({ datasetId });
    expect(addJob).not.toHaveBeenCalled();

    findOne.mockReturnValueOnce(lean({ apiDatasetServer: { apiServer: {} } }));
    await enqueueDatasetPermissionSync({ datasetId });
    expect(addJob).not.toHaveBeenCalled();
  });

  it('swallows lookup errors: enqueue is a side path, not part of the business result', async () => {
    findOne.mockImplementationOnce(() => {
      throw new Error('mongo down');
    });

    await expect(enqueueDatasetPermissionSync({ datasetId })).resolves.toBeUndefined();
    expect(addJob).not.toHaveBeenCalled();
  });

  it('swallows enqueue errors so a committed import is not rolled back', async () => {
    addJob.mockRejectedValueOnce(new Error('redis down'));

    await expect(enqueueDatasetPermissionSync({ datasetId })).resolves.toBeUndefined();
  });
});
