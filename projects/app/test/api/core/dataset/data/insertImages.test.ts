import { DatasetDataIndexStageEnum } from '@fastgpt/global/core/dataset/data/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockResolveMultipleFormData,
  mockClearDiskTempFiles,
  mockAuthDatasetCollection,
  mockAssertUploadRateLimit,
  mockGetTeamPlanStatus,
  mockReadFile,
  mockGetFileS3Key,
  mockUploadImage2S3Bucket,
  mockAppendDatasetIndexTraining,
  mockEnqueueDatasetTrainingBatch,
  mockGetDatasetImageIndexCapability,
  mockGetDatasetEmbeddingModel,
  mockGetDatasetAgentModel,
  mockGetDatasetVlmModel,
  mockGetAuthorizedModelIds
} = vi.hoisted(() => ({
  mockResolveMultipleFormData: vi.fn(),
  mockClearDiskTempFiles: vi.fn(),
  mockAuthDatasetCollection: vi.fn(),
  mockAssertUploadRateLimit: vi.fn(),
  mockGetTeamPlanStatus: vi.fn(),
  mockReadFile: vi.fn(),
  mockGetFileS3Key: {
    dataset: vi.fn()
  },
  mockUploadImage2S3Bucket: vi.fn(),
  mockAppendDatasetIndexTraining: vi.fn(),
  mockEnqueueDatasetTrainingBatch: vi.fn(),
  mockGetDatasetImageIndexCapability: vi.fn(),
  mockGetDatasetEmbeddingModel: vi.fn(),
  mockGetDatasetAgentModel: vi.fn(),
  mockGetDatasetVlmModel: vi.fn(),
  mockGetAuthorizedModelIds: vi.fn()
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

vi.mock('@fastgpt/service/core/dataset/entity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/dataset/entity')>()),
  findDatasetIndexModelReferences: vi.fn(async ({ datasetIds }: { datasetIds: string[] }) =>
    datasetIds.map((_id) => ({ _id, vectorModel: 'vision-embedding' }))
  )
}));

vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  getAuthorizedModelIds: mockGetAuthorizedModelIds
}));

vi.mock('@fastgpt/service/common/rateLimit/interface/upload', () => ({
  assertUploadRateLimit: mockAssertUploadRateLimit
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

vi.mock('@fastgpt/service/core/dataset/training/orchestration', () => ({
  appendDatasetIndexTraining: mockAppendDatasetIndexTraining
}));

vi.mock('@fastgpt/service/core/dataset/training/runtime', () => ({
  enqueueDatasetTrainingBatch: mockEnqueueDatasetTrainingBatch
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => {
  const handle = {
    getModelData: (
      reference: unknown,
      options?: { type?: string; vision?: boolean; optional?: boolean }
    ) => {
      if (options?.vision) return mockGetDatasetVlmModel(reference, options);
      if (options?.type === 'embedding') return mockGetDatasetEmbeddingModel(reference, options);
      return mockGetDatasetAgentModel(reference, options);
    }
  };
  return {
    getSystemModelHandle: async () => handle,
    getTeamModelHandle: async () => handle
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

const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const collectionId = '68ad85a7463006c963799a06';
const datasetId = '68ad85a7463006c963799a07';
const vectorModelData = {
  modelId: '68ad85a7463006c963799a08',
  name: 'vision-embedding',
  model: 'vision-embedding'
};
const agentModelData = {
  modelId: '68ad85a7463006c963799a09',
  name: 'gpt-5',
  model: 'gpt-5'
};

describe('POST /api/core/dataset/data/insertImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthorizedModelIds.mockResolvedValue(new Set<string>());
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
      isRoot: false,
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
    mockGetDatasetEmbeddingModel.mockReturnValue(vectorModelData);
    mockGetDatasetAgentModel.mockReturnValue(agentModelData);
    mockGetDatasetVlmModel.mockReturnValue(undefined);
    mockGetTeamPlanStatus.mockResolvedValue({ standard: { maxUploadFileCount: 10 } });
    mockReadFile.mockResolvedValue(pngBuffer);
    mockGetFileS3Key.dataset.mockReturnValue({ fileKey: 'dataset/team/cat.png' });
    mockUploadImage2S3Bucket.mockResolvedValue('dataset/team/cat.png');
    mockAppendDatasetIndexTraining.mockResolvedValue({ insertLen: 1 });
  });

  it('should upload images with index mode when only native image embedding is available', async () => {
    const result = await handler({} as any);

    expect(result).toBeUndefined();
    expect(mockAppendDatasetIndexTraining).toHaveBeenCalledWith({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      datasetId,
      collectionId,
      indexStatus: DatasetDataIndexStageEnum.index,
      vectorModelId: vectorModelData.modelId,
      agentModelId: agentModelData.modelId,
      vlmModelId: undefined,
      vlmModel: undefined,
      data: [{ imageId: 'dataset/team/cat.png' }]
    });
    expect(mockEnqueueDatasetTrainingBatch).toHaveBeenCalledWith({
      teamId: 'team-id',
      collectionIds: [collectionId]
    });
    expect(mockUploadImage2S3Bucket).toHaveBeenCalledWith('private', {
      buffer: pngBuffer,
      uploadKey: 'dataset/team/cat.png',
      mimetype: 'image/png',
      filename: 'cat.png',
      expiredTime: expect.any(Date)
    });
    expect(mockUploadImage2S3Bucket.mock.calls[0][1]).not.toHaveProperty('base64Img');
    expect(mockAssertUploadRateLimit).toHaveBeenCalledWith({
      identity: 'tmb-id',
      limit: 10,
      increment: 1
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
    expect(mockAppendDatasetIndexTraining).not.toHaveBeenCalled();
    expect(mockEnqueueDatasetTrainingBatch).not.toHaveBeenCalled();
    expect(mockClearDiskTempFiles).toHaveBeenCalledWith(['/tmp/cat.png']);
  });

  it('queues the image parse stage when a VLM is available', async () => {
    const vlmModel = { modelId: '68ad85a7463006c963799a10', name: 'Vision', model: 'vision' };
    mockGetDatasetVlmModel.mockReturnValueOnce(vlmModel);
    mockGetDatasetImageIndexCapability.mockReturnValueOnce({
      availableVlmModel: vlmModel,
      supportVlm: true,
      supportImageEmbedding: false,
      supportImageIndex: true
    });

    await expect(handler({} as any)).resolves.toBeUndefined();
    expect(mockAppendDatasetIndexTraining).toHaveBeenCalledWith(
      expect.objectContaining({
        indexStatus: DatasetDataIndexStageEnum.imageParse,
        vlmModelId: vlmModel.modelId,
        vlmModel
      })
    );
    expect(mockEnqueueDatasetTrainingBatch).toHaveBeenCalledWith({
      teamId: 'team-id',
      collectionIds: [collectionId]
    });
  });

  it('rejects empty image files', async () => {
    mockReadFile.mockResolvedValueOnce(Buffer.alloc(0));

    await expect(handler({} as any)).rejects.toThrow('EmptyUploadFile');
    expect(mockUploadImage2S3Bucket).not.toHaveBeenCalled();
    expect(mockClearDiskTempFiles).toHaveBeenCalledWith(['/tmp/cat.png']);
  });

  it('rejects non-image content even when the filename is png', async () => {
    mockReadFile.mockResolvedValueOnce(Buffer.from('not an image'));

    await expect(handler({} as any)).rejects.toThrow('UploadFileTypeMismatch');
    expect(mockUploadImage2S3Bucket).not.toHaveBeenCalled();
  });
});
