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
import { CreateApiCollectionV2BodySchema } from '@fastgpt/global/openapi/core/dataset/collection/createApi';
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

  it('只允许 chunkConfig 覆盖分块/增强参数，不允许其注入归属字段', async () => {
    mockListFiles.mockResolvedValueOnce([]);

    // 归属字段的白名单在请求边界（CreateApiCollectionV2BodySchema）完成，handler 不再二次 parse，
    // 所以这里与真实入口一致：先过 schema，再交给 createApiDatasetCollection。
    const body = CreateApiCollectionV2BodySchema.parse({
      datasetId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      parentId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      tags: ['product'],
      apiFiles: [
        {
          id: 'file-1',
          rawId: 'file-1',
          parentId: 'cccccccccccccccccccccccc',
          name: 'File 1',
          type: 'file',
          hasChild: false,
          updateTime: new Date(),
          createTime: new Date(),
          chunkConfig: {
            datasetId: 'dddddddddddddddddddddddd',
            parentId: 'eeeeeeeeeeeeeeeeeeeeeeee',
            tags: ['injected-tag'],
            chunkSize: 999,
            indexSize: 111,
            autoIndexes: true
          }
        }
      ]
    });

    await createApiDatasetCollection({
      ...body,
      customPdfParse: false,
      trainingType: 'chunk',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      dataset: {
        _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        teamId: 'team-id',
        type: DatasetTypeEnum.dataset,
        permission: {}
      } as any
    } as any);

    const { createCollectionParams } = mockCreateCollectionAndInsertData.mock.calls[0][0];
    // 分块/增强参数允许按文件覆盖
    expect(createCollectionParams).toMatchObject({
      chunkSize: 999,
      indexSize: 111,
      autoIndexes: true
    });
    // 归属字段仍由请求本身决定，chunkConfig 无法注入
    expect(createCollectionParams.datasetId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(createCollectionParams.parentId).toBe('bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(createCollectionParams.tags).toEqual(['product']);
  });
});
