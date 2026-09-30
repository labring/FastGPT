import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';

const {
  mockAuthDatasetCollection,
  mockMongoDatasetDataFind,
  mockMongoDatasetDataCount,
  mockReplaceS3KeysToPreviewUrls,
  mockCreateS3DownloadAccessUrl,
  mockGetFileMetadata
} = vi.hoisted(() => ({
  mockAuthDatasetCollection: vi.fn(),
  mockMongoDatasetDataFind: vi.fn(),
  mockMongoDatasetDataCount: vi.fn(),
  mockReplaceS3KeysToPreviewUrls: vi.fn(),
  mockCreateS3DownloadAccessUrl: vi.fn(),
  mockGetFileMetadata: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetCollection: mockAuthDatasetCollection
}));

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    find: vi.fn(() => ({
      sort: vi.fn(() => ({
        skip: vi.fn(() => ({
          limit: vi.fn(() => ({
            lean: mockMongoDatasetDataFind
          }))
        }))
      }))
    })),
    countDocuments: mockMongoDatasetDataCount
  }
}));

vi.mock('@fastgpt/service/common/file/image/schema', () => ({
  MongoDatasetImageSchema: {
    find: vi.fn(() => ({
      lean: vi.fn().mockResolvedValue([])
    }))
  }
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    getFileMetadata: mockGetFileMetadata
  })
}));

vi.mock('@fastgpt/service/common/s3/accessLink', () => ({
  createS3DownloadAccessUrl: mockCreateS3DownloadAccessUrl
}));

vi.mock('@fastgpt/service/common/s3/utils/preview', () => ({
  replaceS3KeysToPreviewUrls: mockReplaceS3KeysToPreviewUrls
}));

import handler from '@/pages/api/core/dataset/data/v2/list';

const datasetId = '68ad85a7463006c963799a05';
const collectionId = '68ad85a7463006c963799a06';

describe('GET /api/core/dataset/data/v2/list S3 key preview authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthDatasetCollection.mockResolvedValue({
      teamId: 'team-id',
      collection: {
        _id: collectionId,
        datasetId
      }
    });
    mockMongoDatasetDataCount.mockResolvedValue(1);
    mockReplaceS3KeysToPreviewUrls.mockImplementation((texts: string[]) => texts);
    mockCreateS3DownloadAccessUrl.mockResolvedValue('https://example.com/signed-url');
    mockGetFileMetadata.mockResolvedValue({ contentLength: 1024 });
  });

  it('filters out foreign dataset keys from markdown preview and imageId access link creation', async () => {
    mockMongoDatasetDataFind.mockResolvedValue([
      {
        _id: '68ad85a7463006c963799a07',
        datasetId,
        collectionId,
        q: 'question',
        a: 'answer',
        chunkIndex: 0,
        imageId: 'dataset/foreign-dataset/image.png'
      }
    ]);

    const result = (await handler({
      body: {
        collectionId,
        pageSize: 10
      },
      query: {}
    } as unknown as ApiRequestProps)) as { list: Array<{ imagePreviewUrl?: string }> };

    // 1. replaceS3KeysToPreviewUrls 应接收针对本 datasetId 的 filter
    expect(mockReplaceS3KeysToPreviewUrls).toHaveBeenCalledWith(
      ['question', 'answer'],
      expect.any(Date),
      expect.objectContaining({
        filter: expect.any(Function)
      })
    );

    const filter = mockReplaceS3KeysToPreviewUrls.mock.calls[0]?.[2]?.filter;
    expect(filter(`dataset/${datasetId}/valid.png`)).toBe(true);
    expect(filter('dataset/foreign-dataset/secret.png')).toBe(false);
    expect(filter('chat/app/user/chat/image.png')).toBe(false);

    // 2. 他库的 imageId 不得生成下载短链
    expect(mockCreateS3DownloadAccessUrl).not.toHaveBeenCalled();
    expect(result.list[0].imagePreviewUrl).toBeUndefined();
    // 也不得查询他库 S3 metadata
    expect(mockGetFileMetadata).not.toHaveBeenCalled();
  });

  it('signs own dataset imageId access link', async () => {
    const ownImageId = `dataset/${datasetId}/valid.png`;
    mockMongoDatasetDataFind.mockResolvedValue([
      {
        _id: '68ad85a7463006c963799a08',
        datasetId,
        collectionId,
        q: 'question',
        chunkIndex: 0,
        imageId: ownImageId
      }
    ]);

    const result = (await handler({
      body: {
        collectionId,
        pageSize: 10
      },
      query: {}
    } as unknown as ApiRequestProps)) as { list: Array<{ imagePreviewUrl?: string }> };

    expect(mockGetFileMetadata).toHaveBeenCalledWith(ownImageId);
    expect(mockCreateS3DownloadAccessUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: ownImageId
      })
    );
    expect(result.list[0].imagePreviewUrl).toBe('https://example.com/signed-url');
  });
});
