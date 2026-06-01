import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';

const {
  mockResolveMultipleFormData,
  mockClearDiskTempFiles,
  mockAuthDatasetCollection,
  mockAuthFrequencyLimit,
  mockGetTeamPlanStatus,
  mockReadFile,
  mockGetFileS3Key,
  mockUploadImage2S3Bucket,
  mockMongoSessionRun,
  mockCreateTrainingUsage,
  mockPushDataListToTrainingQueue,
  mockGetDatasetImageIndexCapability
} = vi.hoisted(() => ({
  mockResolveMultipleFormData: vi.fn(),
  mockClearDiskTempFiles: vi.fn(),
  mockAuthDatasetCollection: vi.fn(),
  mockAuthFrequencyLimit: vi.fn(),
  mockGetTeamPlanStatus: vi.fn(),
  mockReadFile: vi.fn(),
  mockGetFileS3Key: {
    dataset: vi.fn()
  },
  mockUploadImage2S3Bucket: vi.fn(),
  mockMongoSessionRun: vi.fn(),
  mockCreateTrainingUsage: vi.fn(),
  mockPushDataListToTrainingQueue: vi.fn(),
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
  authDatasetCollection: mockAuthDatasetCollection
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

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mockMongoSessionRun
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createTrainingUsage: mockCreateTrainingUsage
}));

vi.mock('@fastgpt/service/core/dataset/training/controller', () => ({
  pushDataListToTrainingQueue: mockPushDataListToTrainingQueue
}));

vi.mock('@fastgpt/service/core/ai/model', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getEmbeddingModel: vi.fn((model: string) => ({ name: model, model })),
    getLLMModel: vi.fn((model: string) => ({ name: model, model }))
  };
});

vi.mock('@fastgpt/service/core/dataset/utils', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getDatasetImageIndexCapability: mockGetDatasetImageIndexCapability
  };
});

import handler from '@/pages/api/core/dataset/data/insertImages';

const collectionId = '68ad85a7463006c963799a06';
const datasetId = '68ad85a7463006c963799a07';

describe('POST /api/core/dataset/data/insertImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveMultipleFormData.mockResolvedValue({
      data: { collectionId },
      fileMetadata: [
        {
          path: '/tmp/cat.png',
          filename: 'cat.png',
          mimetype: 'image/png'
        }
      ]
    });
    mockAuthDatasetCollection.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      collection: {
        _id: collectionId,
        name: 'Images',
        datasetId,
        dataset: {
          _id: datasetId,
          vectorModel: 'vision-embedding',
          agentModel: 'gpt-5'
        }
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
    mockMongoSessionRun.mockImplementation((fn: any) => fn('session'));
    mockCreateTrainingUsage.mockResolvedValue({ usageId: 'usage-id' });
    mockPushDataListToTrainingQueue.mockResolvedValue({ insertLen: 1 });
  });

  it('should upload images with chunk mode when only native image embedding is available', async () => {
    const result = await handler({} as any);

    expect(result).toBeUndefined();
    expect(mockCreateTrainingUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        vectorModel: 'vision-embedding',
        agentModel: 'gpt-5',
        vllmModel: undefined,
        session: 'session'
      })
    );
    expect(mockPushDataListToTrainingQueue).toHaveBeenCalledWith({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      datasetId,
      collectionId,
      agentModel: 'gpt-5',
      vectorModel: 'vision-embedding',
      vlmModel: undefined,
      mode: TrainingModeEnum.chunk,
      billId: 'usage-id',
      data: [{ imageId: 'dataset/team/cat.png' }],
      session: 'session'
    });
    expect(mockClearDiskTempFiles).toHaveBeenCalledWith(['/tmp/cat.png']);
  });

  it('should reject image upload when neither VLM nor native image embedding is available', async () => {
    mockGetDatasetImageIndexCapability.mockReturnValueOnce({
      availableVlmModel: undefined,
      supportVlm: false,
      supportImageEmbedding: false,
      supportImageIndex: false
    });

    await expect(handler({} as any)).rejects.toBeTruthy();

    expect(mockUploadImage2S3Bucket).not.toHaveBeenCalled();
    expect(mockPushDataListToTrainingQueue).not.toHaveBeenCalled();
    expect(mockClearDiskTempFiles).toHaveBeenCalledWith(['/tmp/cat.png']);
  });
});
