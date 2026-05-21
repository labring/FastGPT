import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';

const {
  mockResolveMultipleFormData,
  mockClearDiskTempFiles,
  mockAuthDataset,
  mockCheckDatasetIndexLimit,
  mockAuthFrequencyLimit,
  mockGetTeamPlanStatus,
  mockReadFile,
  mockGetFileS3Key,
  mockUploadImage2S3Bucket,
  mockCreateCollectionAndInsertData,
  mockGetDatasetImageIndexCapability
} = vi.hoisted(() => ({
  mockResolveMultipleFormData: vi.fn(),
  mockClearDiskTempFiles: vi.fn(),
  mockAuthDataset: vi.fn(),
  mockCheckDatasetIndexLimit: vi.fn(),
  mockAuthFrequencyLimit: vi.fn(),
  mockGetTeamPlanStatus: vi.fn(),
  mockReadFile: vi.fn(),
  mockGetFileS3Key: {
    dataset: vi.fn()
  },
  mockUploadImage2S3Bucket: vi.fn(),
  mockCreateCollectionAndInsertData: vi.fn(),
  mockGetDatasetImageIndexCapability: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: any) => handler
}));

vi.mock('@fastgpt/service/common/file/multer', () => ({
  multer: {
    resolveMultipleFormData: mockResolveMultipleFormData,
    clearDiskTempFiles: mockClearDiskTempFiles
  }
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mockAuthDataset
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkDatasetIndexLimit: mockCheckDatasetIndexLimit
}));

vi.mock('@fastgpt/service/common/system/frequencyLimit/utils', () => ({
  authFrequencyLimit: mockAuthFrequencyLimit
}));

vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  getTeamPlanStatus: mockGetTeamPlanStatus
}));

vi.mock('node:fs', () => ({
  default: {
    promises: {
      readFile: mockReadFile
    }
  },
  promises: {
    readFile: mockReadFile
  }
}));

vi.mock('@fastgpt/service/common/s3/utils', () => ({
  getFileS3Key: mockGetFileS3Key,
  uploadImage2S3Bucket: mockUploadImage2S3Bucket
}));

vi.mock('@fastgpt/service/core/dataset/collection/controller', () => ({
  createCollectionAndInsertData: mockCreateCollectionAndInsertData
}));

vi.mock('@fastgpt/service/core/dataset/utils', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getDatasetImageIndexCapability: mockGetDatasetImageIndexCapability
  };
});

import handler from '@/pages/api/core/dataset/collection/create/images';

const datasetId = '68ad85a7463006c963799a07';
const parentId = '68ad85a7463006c963799a08';

describe('POST /api/core/dataset/collection/create/images', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveMultipleFormData.mockResolvedValue({
      data: {
        parentId,
        datasetId,
        collectionName: 'Native image embedding collection'
      },
      fileMetadata: [
        {
          path: '/tmp/cat.png',
          filename: 'cat.png',
          mimetype: 'image/png'
        }
      ]
    });
    mockAuthDataset.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      dataset: {
        _id: datasetId,
        vectorModel: 'vision-embedding',
        agentModel: 'gpt-5'
      }
    });
    mockGetDatasetImageIndexCapability.mockReturnValue({
      availableVlmModel: undefined,
      supportVlm: false,
      supportImageEmbedding: true,
      supportImageIndex: true
    });
    mockGetTeamPlanStatus.mockResolvedValue({ standard: { maxUploadFileCount: 10 } });
    mockReadFile.mockResolvedValue(Buffer.from('image-bytes'));
    mockGetFileS3Key.dataset.mockReturnValue({ fileKey: 'dataset/team/cat.png' });
    mockUploadImage2S3Bucket.mockResolvedValue('dataset/team/cat.png');
    mockCreateCollectionAndInsertData.mockResolvedValue({
      collectionId: 'collection-id',
      results: {
        insertLen: 1
      }
    });
  });

  it('should create an image collection with chunk training when only native image embedding is available', async () => {
    const result = await handler({} as any);

    expect(result).toEqual({
      collectionId: 'collection-id',
      results: {
        insertLen: 1
      }
    });
    expect(mockCreateCollectionAndInsertData).toHaveBeenCalledWith({
      dataset: {
        _id: datasetId,
        vectorModel: 'vision-embedding',
        agentModel: 'gpt-5'
      },
      imageIds: ['dataset/team/cat.png'],
      createCollectionParams: {
        parentId,
        teamId: 'team-id',
        tmbId: 'tmb-id',
        datasetId,
        type: DatasetCollectionTypeEnum.images,
        name: 'Native image embedding collection',
        trainingType: DatasetCollectionDataProcessModeEnum.chunk
      }
    });
    expect(mockClearDiskTempFiles).toHaveBeenCalledWith(['/tmp/cat.png']);
  });
});
