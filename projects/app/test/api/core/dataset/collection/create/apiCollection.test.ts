import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthDatasetCollectionCreate = vi.fn();
const mockCreateApiDatasetCollection = vi.fn();
const mockGetFileDetail = vi.fn();

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: any) => handler
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetCollectionCreate: (...args: any[]) => mockAuthDatasetCollectionCreate(...args)
}));

vi.mock('@fastgpt/service/core/dataset/apiDataset', () => ({
  getApiDatasetRequest: vi.fn(async () => ({
    getFileDetail: mockGetFileDetail
  }))
}));

vi.mock('@/pages/api/core/dataset/collection/create/apiCollectionV2', () => ({
  createApiDatasetCollection: (...args: any[]) => mockCreateApiDatasetCollection(...args)
}));

import handler from '@/pages/api/core/dataset/collection/create/apiCollection';

describe('POST /core/dataset/collection/create/apiCollection (V1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthDatasetCollectionCreate.mockResolvedValue({
      teamId: '6acb61a720031dde73883461',
      tmbId: '6acb61a720031dde73883462',
      dataset: { _id: '6acb61a720031dde73883463', apiDatasetServer: {} }
    });
    mockGetFileDetail.mockResolvedValue({
      id: 'f1',
      name: 'File 1',
      type: 'file'
    });
    mockCreateApiDatasetCollection.mockResolvedValue({
      successCount: 1,
      failedCount: 0
    });
  });

  it('当传入 parentId 时，鉴权传递该 parentId 并透传 targetParentId 保证写入与鉴权一致', async () => {
    const res = await handler({
      body: {
        datasetId: '6acb61a720031dde73883463',
        apiFileId: 'f1',
        name: 'File 1',
        parentId: '6acb61a720031dde73883464'
      }
    } as any);

    expect(mockAuthDatasetCollectionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: '6acb61a720031dde73883464'
      })
    );
    expect(mockCreateApiDatasetCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        targetParentId: '6acb61a720031dde73883464'
      })
    );
    expect(res).toEqual({ successCount: 1, failedCount: 0 });
  });

  it('当不传 parentId 时，落知识库根且 targetParentId 为 undefined', async () => {
    const res = await handler({
      body: {
        datasetId: '6acb61a720031dde73883463',
        apiFileId: 'f1',
        name: 'File 1'
      }
    } as any);

    expect(mockAuthDatasetCollectionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: undefined
      })
    );
    expect(mockCreateApiDatasetCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        targetParentId: undefined
      })
    );
    expect(res).toEqual({ successCount: 1, failedCount: 0 });
  });
});
