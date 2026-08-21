import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DatasetSynonymJobStatusEnum,
  DatasetSynonymJobTypeEnum
} from '@fastgpt/global/core/dataset/synonym';

const {
  mockFindJobLean,
  mockAuthDataset,
  mockCancelDatasetSynonymJob,
  mockCreateDatasetSynonymVersion,
  mockGetDatasetSynonymMappings,
  mockProcessDatasetSynonymMarkingJob
} = vi.hoisted(() => ({
  mockFindJobLean: vi.fn(),
  mockAuthDataset: vi.fn(),
  mockCancelDatasetSynonymJob: vi.fn(),
  mockCreateDatasetSynonymVersion: vi.fn(),
  mockGetDatasetSynonymMappings: vi.fn(),
  mockProcessDatasetSynonymMarkingJob: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/core/dataset/synonym/schema', () => ({
  MongoDatasetSynonymJob: {
    findById: vi.fn(() => ({ lean: mockFindJobLean }))
  }
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mockAuthDataset
}));

vi.mock('@fastgpt/service/core/dataset/synonym/controller', () => ({
  cancelDatasetSynonymJob: mockCancelDatasetSynonymJob,
  createDatasetSynonymVersion: mockCreateDatasetSynonymVersion,
  processDatasetSynonymMarkingJob: mockProcessDatasetSynonymMarkingJob
}));

vi.mock('@fastgpt/service/core/dataset/synonym/entity', () => ({
  getDatasetSynonymMappings: mockGetDatasetSynonymMappings
}));

import retryHandler from '@/pages/api/core/dataset/synonym/retry';
import cancelHandler from '@/pages/api/core/dataset/synonym/cancel';

const jobId = '68ee0bd23d17260b7829b131';
const teamId = '68ee0bd23d17260b7829b132';
const tmbId = '68ee0bd23d17260b7829b133';
const datasetId = '68ee0bd23d17260b7829b134';
const billId = '68ee0bd23d17260b7829b135';

const failedJob = {
  _id: jobId,
  teamId,
  tmbId,
  datasetId,
  billId,
  fileName: 'synonyms.csv',
  size: 48,
  fileVersion: 1,
  snapshotReady: true,
  type: DatasetSynonymJobTypeEnum.update,
  status: DatasetSynonymJobStatusEnum.failed
};

describe('dataset synonym retry and cancel APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindJobLean.mockResolvedValue(failedJob);
    mockAuthDataset.mockResolvedValue({ teamId, tmbId });
    mockGetDatasetSynonymMappings.mockResolvedValue([
      {
        standardizedTerm: 'Refund',
        normalizedStandardizedTerm: 'refund',
        synonymTerms: ['refund request'],
        normalizedSynonymTerms: ['refund request'],
        allTerms: 'Refund refund request',
        fingerprint: 'fingerprint'
      }
    ]);
    mockCreateDatasetSynonymVersion.mockResolvedValue({
      synonymId: '68ee0bd23d17260b7829b136',
      fileName: 'synonyms.csv',
      size: 48,
      uploadTime: new Date('2026-08-06T00:00:00.000Z'),
      jobId: '68ee0bd23d17260b7829b137',
      fileVersion: 2,
      diffSummary: {
        added: 1,
        removed: 0,
        changed: 0,
        unchanged: 0,
        affectedDataCount: 0
      }
    });
  });

  it('creates a new version from a failed job while preserving its bill id', async () => {
    const result = await retryHandler({ body: { jobId } } as any);

    expect(mockAuthDataset).toHaveBeenCalledWith(
      expect.objectContaining({ datasetId, per: expect.any(Number) })
    );
    expect(mockCreateDatasetSynonymVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId,
        tmbId,
        datasetId,
        billId,
        type: DatasetSynonymJobTypeEnum.update,
        mappings: [
          expect.objectContaining({
            standardizedTerm: 'Refund',
            synonymTerms: ['refund request']
          })
        ]
      })
    );
    expect(mockProcessDatasetSynonymMarkingJob).toHaveBeenCalledWith('68ee0bd23d17260b7829b137');
    expect(result.jobId).toBe('68ee0bd23d17260b7829b137');
  });

  it('rejects retry when the source job is not failed', async () => {
    mockFindJobLean.mockResolvedValue({
      ...failedJob,
      status: DatasetSynonymJobStatusEnum.processing
    });

    await expect(retryHandler({ body: { jobId } } as any)).rejects.toThrow(
      '仅失败的同义词任务可以重试'
    );
    expect(mockCreateDatasetSynonymVersion).not.toHaveBeenCalled();
  });

  it('authorizes the dataset before cancelling the job', async () => {
    await expect(cancelHandler({ body: { jobId } } as any)).resolves.toBeUndefined();

    expect(mockAuthDataset).toHaveBeenCalledWith(
      expect.objectContaining({ datasetId, per: expect.any(Number) })
    );
    expect(mockCancelDatasetSynonymJob).toHaveBeenCalledWith(jobId);
  });
});
