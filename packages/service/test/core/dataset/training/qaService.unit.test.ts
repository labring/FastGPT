import { describe, expect, it, vi } from 'vitest';
import type { DatasetQaTrainingRepository } from '@fastgpt/dal/db/repos/datasetQaTraining/repo.type';
import { DatasetQaTrainingService } from '@fastgpt/service/core/dataset/training/qaService';

const createMockRepo = (): DatasetQaTrainingRepository => ({
  findById: vi.fn(),
  findOneEditable: vi.fn(),
  list: vi.fn(),
  exists: vi.fn(),
  count: vi.fn(),
  countByCollections: vi.fn(),
  createMany: vi.fn(),
  markFailed: vi.fn(),
  retryMany: vi.fn(),
  deleteOne: vi.fn(),
  deleteMany: vi.fn()
});

describe('DatasetQaTrainingService (L0 unit)', () => {
  it('delegates CRUD and aggregation queries to the injected repository', async () => {
    const repo = createMockRepo();
    vi.mocked(repo.countByCollections).mockResolvedValue([
      { _id: 'col1', activeCount: 2, finalErrorCount: 1 }
    ]);
    vi.mocked(repo.markFailed).mockResolvedValue(true);

    const service = new DatasetQaTrainingService({ repo });

    await expect(
      service.countByCollections({
        teamId: 'team1',
        datasetId: 'ds1',
        collectionIds: ['col1'],
        useReadReplica: true
      })
    ).resolves.toEqual([{ _id: 'col1', activeCount: 2, finalErrorCount: 1 }]);
    expect(repo.countByCollections).toHaveBeenCalledWith({
      teamId: 'team1',
      datasetId: 'ds1',
      collectionIds: ['col1'],
      useReadReplica: true
    });

    await expect(
      service.markFailed({
        teamId: 'team1',
        datasetId: 'ds1',
        collectionId: 'col1',
        id: 'qa1',
        errorMsg: 'failed'
      })
    ).resolves.toBe(true);
    expect(repo.markFailed).toHaveBeenCalledWith({
      teamId: 'team1',
      datasetId: 'ds1',
      collectionId: 'col1',
      id: 'qa1',
      errorMsg: 'failed'
    });
  });
});
