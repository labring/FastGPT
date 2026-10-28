import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import handler from '@/pages/api/core/dataset/apiDataset/list';

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/core/dataset/apiDataset', () => ({ getApiDatasetRequest: vi.fn() }));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({ authDataset: vi.fn() }));
const datasetId = '6acb61a720031dde73883463';
const apiDatasetServer = { yuqueServer: { userId: 'group', token: 'secret' } };
const listFiles = vi.fn();
const invoke = (body: Record<string, unknown>) => handler({ body } as never, {} as never);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authDataset).mockResolvedValue({ dataset: { apiDatasetServer } } as never);
  vi.mocked(getApiDatasetRequest).mockResolvedValue({ listFiles } as never);
  listFiles.mockResolvedValue([]);
});

describe('第三方文件浏览列表缓存注入', () => {
  it('鉴权后使用库中凭证，跨请求注入同一 get/set 缓存对象', async () => {
    await expect(invoke({ datasetId, parentId: '100', searchKey: 'query' })).resolves.toEqual([]);
    await expect(invoke({ datasetId, parentId: '100-10-parent' })).resolves.toEqual([]);
    expect(authDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId,
        per: ReadPermissionVal,
        authToken: true,
        authApiKey: true
      })
    );
    const first = vi.mocked(getApiDatasetRequest).mock.calls[0];
    const second = vi.mocked(getApiDatasetRequest).mock.calls[1];
    expect(first[0]).toBe(apiDatasetServer);
    expect(first[1]?.cache).toMatchObject({ get: expect.any(Function), set: expect.any(Function) });
    expect(second[1]?.cache).toBe(first[1]?.cache);
    expect(listFiles.mock.calls).toEqual([
      [{ parentId: '100', searchKey: 'query' }],
      [{ parentId: '100-10-parent', searchKey: '' }]
    ]);
  });

  it('鉴权失败不会触碰 Provider 或缓存', async () => {
    vi.mocked(authDataset).mockRejectedValue(new Error('denied'));
    await expect(invoke({ datasetId })).rejects.toThrow('denied');
    expect(getApiDatasetRequest).not.toHaveBeenCalled();
  });

  it('Provider 错误继续返回调用方，不能作为空列表', async () => {
    listFiles.mockRejectedValue({ response: { status: 429 }, message: 'quota exhausted' });
    await expect(invoke({ datasetId })).rejects.toMatchObject({ message: 'quota exhausted' });
  });
});
