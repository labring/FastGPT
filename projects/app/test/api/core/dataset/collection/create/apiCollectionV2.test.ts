import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const { mockListFiles, mockCreateCollectionAndInsertData, mockCreateOneCollection } = vi.hoisted(
  () => ({
    mockListFiles: vi.fn(),
    mockCreateCollectionAndInsertData: vi.fn(),
    mockCreateOneCollection: vi.fn()
  })
);

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: any) => handler
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkDatasetIndexLimit: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: {
    find: vi.fn(() => ({
      lean: vi.fn().mockResolvedValue([])
    }))
  }
}));

vi.mock('@fastgpt/service/core/dataset/apiDataset', () => ({
  getApiDatasetRequest: vi.fn(async () => ({
    listFiles: mockListFiles
  }))
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn((fn: any) => fn('session'))
}));

vi.mock('@fastgpt/service/core/dataset/collection/controller', () => ({
  createCollectionAndInsertData: mockCreateCollectionAndInsertData,
  createOneCollection: mockCreateOneCollection
}));

import { createApiDatasetCollection } from '@/pages/api/core/dataset/collection/create/apiCollectionV2';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';

describe('createApiDatasetCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use dingtalk rootNodeId when importing root folder recursively', async () => {
    mockListFiles.mockResolvedValueOnce([
      {
        id: 'doc-1',
        rawId: 'doc-1',
        parentId: 'dingtalk-root',
        name: 'Doc 1',
        type: 'file',
        hasChild: false,
        updateTime: new Date(),
        createTime: new Date()
      }
    ]);

    const dataset = {
      _id: 'dataset-id',
      teamId: 'team-id',
      type: DatasetTypeEnum.dingtalk,
      apiDatasetServer: {
        dingtalkServer: {
          appKey: 'ding-app',
          userId: 'user-id',
          rootNodeId: 'dingtalk-root'
        }
      },
      permission: {}
    } as any;

    await createApiDatasetCollection({
      datasetId: 'dataset-id',
      apiFiles: [
        {
          id: RootCollectionId,
          rawId: RootCollectionId,
          parentId: '',
          name: 'ROOT_FOLDER',
          type: 'folder',
          hasChild: true,
          updateTime: new Date(),
          createTime: new Date()
        }
      ],
      customPdfParse: false,
      trainingType: 'chunk',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      dataset
    } as any);

    expect(getApiDatasetRequest).toHaveBeenCalledWith(dataset.apiDatasetServer);
    expect(mockListFiles).toHaveBeenCalledWith({
      parentId: 'dingtalk-root'
    });
    expect(mockCreateCollectionAndInsertData).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset,
        createCollectionParams: expect.objectContaining({
          apiFileId: 'doc-1',
          type: 'apiFile'
        }),
        session: 'session'
      })
    );
  });
});
