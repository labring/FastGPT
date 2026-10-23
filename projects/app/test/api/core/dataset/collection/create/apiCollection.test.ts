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

vi.mock('@fastgpt/service/core/dataset/apiDataset/service', () => ({
  createApiDatasetCollection: (...args: any[]) => mockCreateApiDatasetCollection(...args)
}));

import handler from '@/pages/api/core/dataset/collection/create/apiCollection';

describe('handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthDatasetCollectionCreate.mockResolvedValue({
      teamId: '6acb61a720031dde73883461',
      tmbId: '6acb61a720031dde73883462',
      dataset: { _id: '6acb61a720031dde73883463', apiDatasetServer: {} }
    });
    mockGetFileDetail.mockResolvedValue({
      success: true,
      data: {
        id: 'f1',
        name: 'File 1',
        type: 'file'
      }
    });
    mockCreateApiDatasetCollection.mockResolvedValue({
      successCount: 1,
      failedCount: 0
    });
  });

  it.each([undefined, '6acb61a720031dde73883464'])(
    '鉴权与实际落位使用同一个 parentId：%s',
    async (parentId) => {
      const result = await handler(
        {
          body: { datasetId: '6acb61a720031dde73883463', apiFileId: 'f1', name: 'File 1', parentId }
        } as any,
        {} as Parameters<typeof handler>[1]
      );
      expect(mockAuthDatasetCollectionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ parentId })
      );
      expect(mockGetFileDetail).toHaveBeenCalledWith({ apiFileId: 'f1' });
      expect(mockCreateApiDatasetCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          targetParentId: parentId,
          apiFiles: [expect.objectContaining({ id: 'f1' })]
        })
      );
      expect(result).toEqual({ successCount: 1, failedCount: 0 });
    }
  );

  it('详情失败时透传错误且不创建集合', async () => {
    mockGetFileDetail.mockResolvedValue({
      success: false,
      code: 'NOT_FOUND',
      message: 'detail unavailable'
    });
    await expect(
      handler(
        {
          body: { datasetId: '6acb61a720031dde73883463', apiFileId: 'f1', name: 'File 1' }
        } as any,
        {} as Parameters<typeof handler>[1]
      )
    ).rejects.toBe('detail unavailable');
    expect(mockCreateApiDatasetCollection).not.toHaveBeenCalled();
  });
});
