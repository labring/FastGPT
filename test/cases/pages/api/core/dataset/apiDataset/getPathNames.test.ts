import { describe, expect, it, vi } from 'vitest';
import { getFullPath, handler } from '@/pages/api/core/dataset/apiDataset/getPathNames';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ApiDatasetDetailResponse } from '@fastgpt/global/core/dataset/apiDataset';
import { useApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/api';
import { getProApiDatasetFileDetailRequest } from '@/service/core/dataset/apiDataset/controller';

vi.mock('@fastgpt/service/core/dataset/apiDataset/api', () => ({
  useApiDatasetRequest: vi.fn()
}));

vi.mock('@/service/core/dataset/apiDataset/controller', () => ({
  getProApiDatasetFileDetailRequest: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: vi.fn()
}));

describe('getFullPath', () => {
  it('should return empty string if response is null', async () => {
    const getFileDetail = vi.fn().mockResolvedValue(null);
    const result = await getFullPath('id', getFileDetail);
    expect(result).toBe('');
  });

  it('should return file path for single file', async () => {
    const mockResponse: ApiDatasetDetailResponse = {
      name: 'file1',
      parentId: null
    } as ApiDatasetDetailResponse;

    const getFileDetail = vi.fn().mockResolvedValue(mockResponse);
    const result = await getFullPath('id', getFileDetail);
    expect(result).toBe('/file1');
  });

  it('should return nested path for files with parent', async () => {
    const mockResponses: Record<string, ApiDatasetDetailResponse> = {
      id3: {
        name: 'file3',
        parentId: 'id2'
      } as ApiDatasetDetailResponse,
      id2: {
        name: 'file2',
        parentId: 'id1'
      } as ApiDatasetDetailResponse,
      id1: {
        name: 'file1',
        parentId: null
      } as ApiDatasetDetailResponse
    };

    const getFileDetail = vi.fn().mockImplementation(({ apiFileId }) => {
      return Promise.resolve(mockResponses[apiFileId]);
    });

    const result = await getFullPath('id3', getFileDetail);
    expect(result).toBe('/file1/file2/file3');
  });
});

describe('handler', () => {
  it('should return empty string if no parentId', async () => {
    const req = {
      body: {}
    };
    const result = await handler(req, {} as any);
    expect(result).toBe('');
  });

  it('should reject if no api server configured', async () => {
    const req = {
      body: {
        parentId: 'id'
      }
    };
    await expect(handler(req, {} as any)).rejects.toBe(DatasetErrEnum.noApiServer);
  });

  it('should return empty string for feishu server', async () => {
    const req = {
      body: {
        parentId: 'id',
        feishuServer: {}
      }
    };
    const result = await handler(req, {} as any);
    expect(result).toBe('');
  });

  it('should call getFullPath with api server', async () => {
    const mockApiServer = {
      authorization: 'token'
    };
    const mockGetFileDetail = vi.fn();

    vi.mocked(useApiDatasetRequest).mockReturnValue({
      getFileDetail: mockGetFileDetail
    } as any);

    const req = {
      body: {
        parentId: 'id',
        apiServer: mockApiServer
      }
    };

    await handler(req, {} as any);

    expect(useApiDatasetRequest).toHaveBeenCalledWith({ apiServer: mockApiServer });
    expect(mockGetFileDetail).toHaveBeenCalled();
  });

  it('should call getFullPath with yuque server', async () => {
    const mockYuqueServer = {
      token: 'token'
    };

    vi.mocked(getProApiDatasetFileDetailRequest).mockResolvedValue({} as any);

    const req = {
      body: {
        parentId: 'id',
        yuqueServer: mockYuqueServer
      }
    };

    await handler(req, {} as any);

    expect(getProApiDatasetFileDetailRequest).toHaveBeenCalledWith({
      yuqueServer: mockYuqueServer,
      apiFileId: 'id'
    });
  });
});
