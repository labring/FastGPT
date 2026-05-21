import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

const {
  mockAuthDatasetData,
  mockUpdateDatasetDataByIndexes,
  mockUpdateDatasetDataSystemIndexes,
  mockPushGenerateVectorUsage,
  mockAddAuditLog,
  mockReplaceS3KeyToPreviewUrl
} = vi.hoisted(() => ({
  mockAuthDatasetData: vi.fn(),
  mockUpdateDatasetDataByIndexes: vi.fn(),
  mockUpdateDatasetDataSystemIndexes: vi.fn(),
  mockPushGenerateVectorUsage: vi.fn(),
  mockAddAuditLog: vi.fn(),
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
  updateDatasetDataSystemIndexes: mockUpdateDatasetDataSystemIndexes
}));

vi.mock('@/service/support/wallet/usage/push', () => ({
  pushGenerateVectorUsage: mockPushGenerateVectorUsage
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: mockAddAuditLog,
  getI18nDatasetType: vi.fn((type: string) => type)
}));

vi.mock('@fastgpt/service/core/dataset/utils', () => ({
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
    mockReplaceS3KeyToPreviewUrl.mockImplementation((text: string) => text);
    mockUpdateDatasetDataByIndexes.mockResolvedValue({ tokens: 12 });
    mockUpdateDatasetDataSystemIndexes.mockResolvedValue({ tokens: 0 });
  });

  it('should keep legacy indexes update API compatible while rebuilding system image embedding indexes', async () => {
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
      imageId: 'dataset/team/main.png',
      imageIndex: true,
      indexes: [
        {
          type: DatasetDataIndexTypeEnum.custom,
          text: 'new custom'
        }
      ],
      model: 'vision-embedding',
      indexSize: 256,
      indexPrefix: '# Collection'
    });
    expect(mockUpdateDatasetDataSystemIndexes).not.toHaveBeenCalled();
    expect(mockPushGenerateVectorUsage).toHaveBeenCalledWith({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      inputTokens: 12,
      model: 'vision-embedding'
    });
    expect(result).toEqual({
      q: 'new question',
      a: 'new answer'
    });
  });

  it('should pass an explicit empty question to the index update path', async () => {
    await handler({
      body: {
        dataId,
        q: '',
        a: '',
        indexes: []
      }
    } as any);

    expect(mockUpdateDatasetDataByIndexes).toHaveBeenCalledWith(
      expect.objectContaining({
        dataId,
        q: '',
        a: '',
        imageId: 'dataset/team/main.png',
        imageIndex: true,
        indexes: []
      })
    );
  });

  it('should pass image context when rebuilding generated indexes', async () => {
    await handler({
      body: {
        dataId,
        q: 'new question ![new](dataset/team/new.png)'
      }
    } as any);

    expect(mockUpdateDatasetDataSystemIndexes).toHaveBeenCalledWith({
      dataId,
      q: 'new question ![new](dataset/team/new.png)',
      a: 'old answer',
      imageId: 'dataset/team/main.png',
      imageIndex: true,
      model: 'vision-embedding',
      indexSize: 256,
      indexPrefix: '# Collection'
    });
    expect(mockUpdateDatasetDataByIndexes).not.toHaveBeenCalled();
  });
});
