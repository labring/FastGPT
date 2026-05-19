import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

const {
  mockAuthDatasetData,
  mockUpdateDatasetDataByIndexes,
  mockUpdateDatasetDataDefaultIndexes,
  mockUpdateDatasetDataGeneratedIndexes,
  mockPushGenerateVectorUsage,
  mockAddAuditLog,
  mockGetDatasetImageIndexCapability,
  mockReplaceS3KeyToPreviewUrl
} = vi.hoisted(() => ({
  mockAuthDatasetData: vi.fn(),
  mockUpdateDatasetDataByIndexes: vi.fn(),
  mockUpdateDatasetDataDefaultIndexes: vi.fn(),
  mockUpdateDatasetDataGeneratedIndexes: vi.fn(),
  mockPushGenerateVectorUsage: vi.fn(),
  mockAddAuditLog: vi.fn(),
  mockGetDatasetImageIndexCapability: vi.fn(),
  mockReplaceS3KeyToPreviewUrl: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: any) => handler
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetData: mockAuthDatasetData
}));

vi.mock('@/service/core/dataset/data/data', () => ({
  updateDatasetDataByIndexes: mockUpdateDatasetDataByIndexes,
  updateDatasetDataDefaultIndexes: mockUpdateDatasetDataDefaultIndexes,
  updateDatasetDataGeneratedIndexes: mockUpdateDatasetDataGeneratedIndexes
}));

vi.mock('@/service/support/wallet/usage/push', () => ({
  pushGenerateVectorUsage: mockPushGenerateVectorUsage
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: mockAddAuditLog,
  getI18nDatasetType: vi.fn((type: string) => type)
}));

vi.mock('@fastgpt/service/core/dataset/utils', () => ({
  buildDatasetDataIndexRebuildPlan: vi.fn(() => ({ indexes: [] })),
  getDatasetImageIndexCapability: mockGetDatasetImageIndexCapability,
  replaceS3KeyToPreviewUrl: mockReplaceS3KeyToPreviewUrl
}));

import handler from '@/pages/api/core/dataset/data/update';

const dataId = '68ad85a7463006c963799a05';

const buildAuthResult = () => ({
  teamId: 'team-id',
  tmbId: 'tmb-id',
  collection: {
    name: 'Collection',
    indexPrefixTitle: true,
    indexSize: 256,
    imageIndex: true,
    type: DatasetCollectionTypeEnum.images,
    dataset: {
      name: 'Dataset',
      type: 'dataset',
      vectorModel: 'vision-embedding',
      vlmModel: 'vlm-model'
    }
  },
  datasetData: {
    q: 'old question',
    a: 'old answer',
    imageId: 'dataset/team/main.png',
    indexes: [
      {
        type: DatasetDataIndexTypeEnum.custom,
        text: 'old custom',
        dataId: 'custom_old'
      },
      {
        type: DatasetDataIndexTypeEnum.imageEmbedding,
        text: 'dataset/team/main.png',
        dataId: 'image_embedding_old'
      }
    ]
  }
});

describe('PUT /api/core/dataset/data/update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthDatasetData.mockResolvedValue(buildAuthResult());
    mockGetDatasetImageIndexCapability.mockReturnValue({
      supportImageEmbedding: true
    });
    mockReplaceS3KeyToPreviewUrl.mockImplementation((text: string) => text);
    mockUpdateDatasetDataByIndexes.mockResolvedValue({ tokens: 12 });
    mockUpdateDatasetDataDefaultIndexes.mockResolvedValue({ tokens: 0 });
    mockUpdateDatasetDataGeneratedIndexes.mockResolvedValue({ tokens: 0 });
  });

  it('should keep legacy indexes update API compatible while preserving system image embedding indexes', async () => {
    const result = await handler({
      body: {
        dataId,
        q: 'new question',
        a: 'new answer',
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: 'new custom'
          },
          {
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: 'dataset/team/client-should-not-replace.png'
          }
        ]
      }
    } as any);

    expect(mockUpdateDatasetDataByIndexes).toHaveBeenCalledWith({
      dataId,
      q: 'new question',
      a: 'new answer',
      indexes: [
        {
          type: DatasetDataIndexTypeEnum.custom,
          text: 'new custom'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/main.png',
          dataId: 'image_embedding_old'
        }
      ],
      model: 'vision-embedding',
      indexSize: 256,
      indexPrefix: '# Collection'
    });
    expect(mockUpdateDatasetDataGeneratedIndexes).not.toHaveBeenCalled();
    expect(mockUpdateDatasetDataDefaultIndexes).not.toHaveBeenCalled();
    expect(mockPushGenerateVectorUsage).toHaveBeenCalledWith({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      inputTokens: 12,
      model: 'vision-embedding'
    });
    expect(result).toEqual({
      dataId,
      rebuilding: false,
      q: 'new question',
      a: 'new answer'
    });
  });
});
