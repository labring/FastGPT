import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';
import handler from '@/pages/api/core/dataset/file/presignDatasetFilePostUrl';

const mocks = vi.hoisted(() => ({
  authDataset: vi.fn(),
  getTeamPlanStatus: vi.fn(),
  assertUploadRateLimit: vi.fn(),
  createUploadDatasetFileURL: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mocks.authDataset
}));
vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  getTeamPlanStatus: mocks.getTeamPlanStatus
}));
vi.mock('@fastgpt/service/common/rateLimit/interface/upload', () => ({
  assertUploadRateLimit: mocks.assertUploadRateLimit
}));
vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({ createUploadDatasetFileURL: mocks.createUploadDatasetFileURL })
}));

describe('presignDatasetFilePostUrl upload limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.feConfigs = {
      ...global.feConfigs,
      limit: { ...global.feConfigs?.limit, uploadFileMaxSize: 1000, uploadFileMaxAmount: 1000 }
    };
    mocks.authDataset.mockResolvedValue({ teamId: 'team-1', userId: 'user-1' });
    mocks.createUploadDatasetFileURL.mockImplementation(async ({ maxFileSize }) => ({
      uploadMode: 'single',
      url: 'https://storage.example.com/upload',
      previewUrl: 'https://storage.example.com/preview',
      key: 'dataset/file.pdf',
      headers: {},
      maxSize: maxFileSize * 1024 ** 2
    }));
  });

  it.each([
    { maxUploadFileSize: 0, maxUploadFileCount: 0, expectedSize: 1000, expectedCount: 1000 },
    { maxUploadFileSize: 20, maxUploadFileCount: 2, expectedSize: 20, expectedCount: 2 }
  ])('uses the same limits for validation and response: %j', async (plan) => {
    mocks.getTeamPlanStatus.mockResolvedValue({ standard: plan });
    const request = {
      body: { filename: 'file.pdf', datasetId: '507f1f77bcf86cd799439011', size: 1024 }
    } as ApiRequestProps;
    const result = await (
      handler as unknown as (req: ApiRequestProps) => Promise<{ maxSize: number }>
    )(request);
    expect(mocks.assertUploadRateLimit).toHaveBeenCalledWith({
      identity: 'user-1',
      limit: plan.expectedCount
    });
    expect(mocks.createUploadDatasetFileURL).toHaveBeenCalledWith(
      expect.objectContaining({ maxFileSize: plan.expectedSize })
    );
    expect(result.maxSize).toBe(plan.expectedSize * 1024 ** 2);
  });
});
