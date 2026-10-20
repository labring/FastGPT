import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import handler from '@/pages/api/core/dataset/apiDataset/getPathNames';

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/core/dataset/apiDataset', () => ({ getApiDatasetRequest: vi.fn() }));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({ authDataset: vi.fn() }));
vi.mock('@fastgpt/service/support/permission/auth/common', () => ({ authCert: vi.fn() }));

const getFileDetail = vi.fn();
const apiDatasetServer = { apiServer: { baseUrl: 'https://example.com', authorization: 'secret' } };
const datasetId = '6acb61a720031dde73883463';
const invoke = (body: Record<string, unknown>) => handler({ body } as never, {} as never);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getApiDatasetRequest).mockResolvedValue({ getFileDetail } as never);
  vi.mocked(authDataset).mockResolvedValue({ dataset: { apiDatasetServer } } as never);
});

describe('handler', () => {
  it('未选择父节点时直接返回空路径', async () => {
    await expect(invoke({})).resolves.toBe('');
    expect(getApiDatasetRequest).not.toHaveBeenCalled();
  });

  it.each([undefined, datasetId])('根据 datasetId=%s 使用对应鉴权和服务配置', async (id) => {
    getFileDetail.mockResolvedValue({ success: true, data: { name: 'Root', parentId: null } });
    await expect(invoke({ datasetId: id, parentId: 'root', apiDatasetServer })).resolves.toBe(
      '/Root'
    );
    expect(getApiDatasetRequest).toHaveBeenCalledWith(apiDatasetServer);
    if (id) {
      expect(authDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          datasetId: id,
          per: ManagePermissionVal,
          authToken: true,
          authApiKey: true
        })
      );
      expect(authCert).not.toHaveBeenCalled();
    } else {
      expect(authCert).toHaveBeenCalledWith(expect.objectContaining({ authToken: true }));
      expect(authDataset).not.toHaveBeenCalled();
    }
  });

  it('缺失 provider 方法时返回未配置服务错误', async () => {
    vi.mocked(getApiDatasetRequest).mockResolvedValue({} as never);
    await expect(invoke({ parentId: 'root', apiDatasetServer })).rejects.toBe(
      DatasetErrEnum.noApiServer
    );
  });

  it('鉴权失败后不访问 provider', async () => {
    vi.mocked(authDataset).mockRejectedValue(new Error('denied'));
    await expect(invoke({ datasetId, parentId: 'root' })).rejects.toThrow('denied');
    expect(getApiDatasetRequest).not.toHaveBeenCalled();
  });
});

describe('getFullPath（通过 handler 验证）', () => {
  it('读取父链并按根到叶拼接名称', async () => {
    getFileDetail.mockImplementation(async ({ apiFileId }: { apiFileId: string }) => ({
      success: true,
      data: { name: apiFileId, parentId: apiFileId === 'child' ? 'root' : undefined }
    }));
    await expect(invoke({ parentId: 'child', apiDatasetServer })).resolves.toBe('/root/child');
    expect(getFileDetail.mock.calls).toEqual([[{ apiFileId: 'child' }], [{ apiFileId: 'root' }]]);
  });

  it.each([
    { success: false, code: 'NOT_FOUND', message: 'deleted' },
    { success: false, code: 'SERVER_ERROR', message: 'unavailable' },
    { success: true, data: undefined }
  ])('无详情时终止父链查询：%j', async (result) => {
    getFileDetail.mockResolvedValue(result);
    await expect(invoke({ parentId: 'child', apiDatasetServer })).resolves.toBe('');
    expect(getFileDetail).toHaveBeenCalledTimes(1);
  });
});
