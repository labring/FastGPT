import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  readFileRawTextByUrl: vi.fn(),
  getRawTextBuffer: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  createProxyAxios: () => ({
    request: mocks.request
  })
}));

vi.mock('@fastgpt/service/core/dataset/read', () => ({
  readFileRawTextByUrl: mocks.readFileRawTextByUrl
}));

vi.mock('@fastgpt/service/common/s3/sources/rawText', () => ({
  getS3RawTextSource: () => ({
    getRawTextBuffer: mocks.getRawTextBuffer,
    addRawTextBuffer: vi.fn()
  })
}));

import { useApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/custom/api';
import { buildApiFileTree } from '@fastgpt/service/core/dataset/apiDataset/tree';

describe('useApiDatasetRequest.getFileContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRawTextBuffer.mockResolvedValue(undefined);
    mocks.readFileRawTextByUrl.mockResolvedValue({ rawText: 'parsed content' });
    mocks.request.mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          title: 'report.pdf',
          previewUrl: 'https://example.com/report.pdf'
        }
      }
    });
  });

  it('passes training usageId to preview URL PDF parsing', async () => {
    const request = useApiDatasetRequest({
      apiServer: {
        baseUrl: 'https://api.example.com',
        authorization: 'token'
      } as any
    });

    await request.getFileContent({
      teamId: 'team-a',
      tmbId: 'tmb-a',
      apiFileId: 'file-a',
      datasetId: 'dataset-a',
      customPdfParse: true,
      usageId: 'usage-a'
    });

    expect(mocks.readFileRawTextByUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        customPdfParse: true,
        usageId: 'usage-a'
      })
    );
  });
});

/**
 * 被测函数名: useApiDatasetRequest.getFileDetail  等级: 3-High
 * 思路（回归场景）: getFileDetail 曾丢弃 hasChild。同步在「局部导入」时拿它的返回值当根种子，
 * 而 buildApiFileTree 只在 seed.hasChild 为真时才调 listFiles 展开子级 —— 后代因此不再被遍历，
 * 全部留在删除候选集里，最后被 delCollection(delFile: true) 整棵删掉，且下一轮也重建不回来。
 * 本组用例钉住「详情 → 根种子 → 子树遍历」这条链。
 */
describe('useApiDatasetRequest.getFileDetail', () => {
  const apiServer = { baseUrl: 'https://api.example.com', authorization: 'token' };

  const ok = (data: unknown) => ({ data: { success: true, message: '', data } });

  const detail = (props: Record<string, unknown>) => ({
    id: 'root',
    name: 'Root',
    parentId: null,
    type: 'folder',
    updateTime: new Date(),
    createTime: new Date(),
    ...props
  });

  /** 自定义接口一个 url 一个端点，按 url 分发响应 */
  const mockRequestByUrl = (byUrl: Record<string, unknown>) => {
    mocks.request.mockImplementation(async ({ url }: any) => {
      if (!(url in byUrl)) throw new Error(`unexpected url ${url}`);
      return ok(byUrl[url]);
    });
  };

  const provider = () => useApiDatasetRequest({ apiServer } as any);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('对方没给 hasChild 时按 type 回退，folder 不退化', async () => {
    mockRequestByUrl({ '/v1/file/detail': detail({ type: 'folder' }) });

    await expect(provider().getFileDetail({ apiFileId: 'root' })).resolves.toMatchObject({
      id: 'root',
      type: 'folder',
      hasChild: true
    });
  });

  it('对方给了 hasChild 时以对方为准：folder 可以无子级，file 可以挂子级', async () => {
    mockRequestByUrl({ '/v1/file/detail': detail({ type: 'folder', hasChild: false }) });
    await expect(provider().getFileDetail({ apiFileId: 'root' })).resolves.toMatchObject({
      hasChild: false
    });

    mockRequestByUrl({ '/v1/file/detail': detail({ type: 'file', hasChild: true }) });
    await expect(provider().getFileDetail({ apiFileId: 'root' })).resolves.toMatchObject({
      hasChild: true
    });
  });

  it('详情返回值直接当同步根种子时，子树被完整遍历', async () => {
    mockRequestByUrl({
      '/v1/file/detail': detail({ type: 'folder' }),
      '/v1/file/list': [
        {
          id: 'child',
          name: 'Child',
          parentId: 'root',
          type: 'file',
          updateTime: new Date(),
          createTime: new Date()
        }
      ]
    });

    const api = provider();
    const nodes = await buildApiFileTree({
      request: api as any,
      seeds: [await api.getFileDetail({ apiFileId: 'root' })]
    });

    expect(nodes.map((node) => node.serverId)).toEqual(['root', 'child']);
  });
});
