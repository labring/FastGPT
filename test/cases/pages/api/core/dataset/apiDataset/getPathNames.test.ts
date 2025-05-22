import { describe, expect, it, vi } from 'vitest';
import { getFullPath, handler } from '@/pages/api/core/dataset/apiDataset/getPathNames';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/getApiRequest';

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: vi.fn().mockResolvedValue(true)
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: vi.fn().mockResolvedValue({
    dataset: {
      yuqueServer: null,
      feishuServer: null,
      apiServer: null
    }
  })
}));

vi.mock('@fastgpt/service/core/dataset/getApiRequest', () => ({
  getApiDatasetRequest: vi.fn()
}));

describe('getFullPath', () => {
  it('should return empty string if no response', async () => {
    const getFileDetail = vi.fn().mockResolvedValue(null);
    const result = await getFullPath('id', getFileDetail);
    expect(result).toBe('');
  });

  it('should return path for single file', async () => {
    const getFileDetail = vi.fn().mockResolvedValue({
      name: 'file1',
      parentId: null
    });
    const result = await getFullPath('id', getFileDetail);
    expect(result).toBe('/file1');
  });

  it('should return full path for nested files', async () => {
    const getFileDetail = vi
      .fn()
      .mockResolvedValueOnce({
        name: 'file2',
        parentId: 'parent1'
      })
      .mockResolvedValueOnce({
        name: 'file1',
        parentId: null
      });
    const result = await getFullPath('id', getFileDetail);
    expect(result).toBe('/file1/file2');
  });
});

describe('handler', () => {
  const mockReq = {
    body: {},
    headers: {},
    query: {}
  };

  const mockRes = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  };

  it('should return empty string if no parentId', async () => {
    const result = await handler(mockReq, mockRes);
    expect(result).toBe('');
  });

  it('should reject if no api server configured', async () => {
    const req = {
      ...mockReq,
      body: {
        parentId: 'id1'
      }
    };
    await expect(handler(req, mockRes)).rejects.toBe(DatasetErrEnum.noApiServer);
  });

  it('should return empty string for feishu server', async () => {
    const req = {
      ...mockReq,
      body: {
        parentId: 'id1',
        feishuServer: {}
      }
    };
    const result = await handler(req, mockRes);
    expect(result).toBe('');
  });

  it('should get path for yuque server', async () => {
    const req = {
      ...mockReq,
      body: {
        parentId: 'id1',
        yuqueServer: {}
      }
    };

    const mockGetFileDetail = vi.fn().mockResolvedValue({
      name: 'test',
      parentId: null
    });

    vi.mocked(getApiDatasetRequest).mockResolvedValue({
      getFileDetail: mockGetFileDetail
    });

    const result = await handler(req, mockRes);
    expect(result).toBe('/test');
  });

  it('should get path for api server', async () => {
    const req = {
      ...mockReq,
      body: {
        parentId: 'id1',
        apiServer: {}
      }
    };

    const mockGetFileDetail = vi.fn().mockResolvedValue({
      name: 'test',
      parentId: null
    });

    vi.mocked(getApiDatasetRequest).mockResolvedValue({
      getFileDetail: mockGetFileDetail
    });

    const result = await handler(req, mockRes);
    expect(result).toBe('/test');
  });

  it('should reject if api dataset request returns no file detail', async () => {
    const req = {
      ...mockReq,
      body: {
        parentId: 'id1',
        apiServer: {}
      }
    };

    vi.mocked(getApiDatasetRequest).mockResolvedValue({});

    await expect(handler(req, mockRes)).rejects.toBe(DatasetErrEnum.noApiServer);
  });
});
