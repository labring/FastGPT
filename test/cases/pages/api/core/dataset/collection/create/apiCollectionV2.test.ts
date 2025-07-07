import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiDatasetCollection } from '@/pages/api/core/dataset/collection/create/apiCollectionV2';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  createOneCollection,
  createCollectionAndInsertData
} from '@fastgpt/service/core/dataset/collection/controller';

vi.mock('@fastgpt/service/core/dataset/collection/schema', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/dataset/collection/schema')>();
  return {
    ...actual,
    MongoDatasetCollection: {
      find: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      })
    },
    DatasetColCollectionName: 'datasetCollection'
  };
});

vi.mock('@fastgpt/service/core/dataset/apiDataset', () => ({
  getApiDatasetRequest: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/collection/controller', () => ({
  createOneCollection: vi.fn(),
  createCollectionAndInsertData: vi.fn()
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn((callback) => callback({ id: 'mockSession' }))
}));

describe('createApiDatasetCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockDataset = {
    _id: 'dataset1',
    teamId: 'team1',
    apiDatasetServer: {
      apiServer: {
        basePath: 'base/path'
      }
    }
  };

  const mockListFilesResponse = [
    {
      id: 'file1',
      name: 'file1.txt',
      type: 'file',
      hasChild: false
    },
    {
      id: 'folder1',
      name: 'folder1',
      type: 'folder',
      hasChild: true
    }
  ];

  const mockSubFiles = [
    {
      id: 'subfile1',
      name: 'subfile1.txt',
      type: 'file',
      hasChild: false
    }
  ];

  it('should create collections for files and folders', async () => {
    const mockListFiles = vi
      .fn()
      .mockResolvedValueOnce(mockListFilesResponse)
      .mockResolvedValueOnce(mockSubFiles);

    vi.mocked(getApiDatasetRequest).mockResolvedValue({ listFiles: mockListFiles });

    await createApiDatasetCollection({
      teamId: 'team1',
      tmbId: 'tmb1',
      dataset: mockDataset as any,
      apiFiles: mockListFilesResponse,
      customPdfParse: false,
      datasetId: 'dataset1'
    });

    expect(getApiDatasetRequest).toHaveBeenCalledWith(mockDataset.apiDatasetServer);
    expect(createOneCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team1',
        name: 'folder1',
        type: DatasetCollectionTypeEnum.folder
      })
    );
    expect(createCollectionAndInsertData).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: mockDataset,
        createCollectionParams: expect.objectContaining({
          name: 'file1.txt',
          type: DatasetCollectionTypeEnum.apiFile
        })
      })
    );
  });

  it('should handle root directory selection', async () => {
    const mockListFiles = vi
      .fn()
      .mockResolvedValueOnce(mockListFilesResponse)
      .mockResolvedValueOnce(mockSubFiles);

    vi.mocked(getApiDatasetRequest).mockResolvedValue({ listFiles: mockListFiles });

    await createApiDatasetCollection({
      teamId: 'team1',
      tmbId: 'tmb1',
      dataset: mockDataset as any,
      apiFiles: [
        {
          id: RootCollectionId,
          name: 'root',
          type: 'folder',
          hasChild: true
        }
      ],
      customPdfParse: false,
      datasetId: 'dataset1'
    });

    expect(mockListFiles).toHaveBeenCalledWith({ parentId: 'base/path' });
  });

  it('should skip existing files', async () => {
    vi.mocked(MongoDatasetCollection.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ apiFileId: 'file1' }])
    });

    const mockListFiles = vi.fn().mockResolvedValue([]);
    vi.mocked(getApiDatasetRequest).mockResolvedValue({ listFiles: mockListFiles });

    await createApiDatasetCollection({
      teamId: 'team1',
      tmbId: 'tmb1',
      dataset: mockDataset as any,
      apiFiles: [
        {
          id: 'file1',
          name: 'file1.txt',
          type: 'file',
          hasChild: false
        }
      ],
      customPdfParse: false,
      datasetId: 'dataset1'
    });

    expect(mockListFiles).not.toHaveBeenCalled();
    expect(createCollectionAndInsertData).not.toHaveBeenCalled();
  });
});
