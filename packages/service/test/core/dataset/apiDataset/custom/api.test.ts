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

describe('useApiDatasetRequest other methods', () => {
  const apiServer = { baseUrl: 'https://api.example.com', authorization: 'token' };
  const ok = (data: unknown) => ({ data: { success: true, message: '', data } });
  const provider = () => useApiDatasetRequest({ apiServer } as any);

  it('getFileContent 直接返回 inline content', async () => {
    mocks.request.mockResolvedValueOnce(
      ok({ title: 'Direct Doc', content: 'hello direct content' })
    );
    const res = await provider().getFileContent({
      teamId: 't',
      tmbId: 'tmb',
      apiFileId: 'f1',
      datasetId: 'd1'
    });
    expect(res).toEqual({ title: 'Direct Doc', rawText: 'hello direct content' });
  });

  it('getFilePreviewUrl 获取只读 URL', async () => {
    mocks.request.mockResolvedValueOnce(ok({ url: 'https://preview.example.com/file' }));
    const url = await provider().getFilePreviewUrl({ apiFileId: 'f1' });
    expect(url).toBe('https://preview.example.com/file');
  });

  it('getFileRawId 返回原始 ID', () => {
    expect(provider().getFileRawId('raw-1')).toBe('raw-1');
  });

  it('listFiles 格式校验', async () => {
    mocks.request.mockResolvedValueOnce(ok('not-array'));
    await expect(provider().listFiles({})).rejects.toBe('Invalid file list format');

    mocks.request.mockResolvedValueOnce(ok([{ id: '' }]));
    await expect(provider().listFiles({})).rejects.toBe('Invalid file data format');
  });

  it('响应异常处理：空响应、失败标识与错误包装', async () => {
    mocks.request.mockResolvedValueOnce({ data: undefined });
    await expect(provider().listFiles({})).rejects.toEqual({ message: '服务器异常' });

    mocks.request.mockResolvedValueOnce({ data: { success: false, message: 'fail' } });
    await expect(provider().listFiles({})).rejects.toEqual({ message: 'fail' });

    mocks.request.mockRejectedValueOnce('raw string error');
    await expect(provider().listFiles({})).rejects.toEqual({ message: 'raw string error' });
  });

  it('getFileContent 命中 S3 缓存 buffer', async () => {
    mocks.getRawTextBuffer.mockResolvedValueOnce({ text: 'buffered text', filename: 'cached.pdf' });
    mocks.request.mockResolvedValueOnce(ok({ previewUrl: 'https://example.com/cached.pdf' }));
    const res = await provider().getFileContent({
      teamId: 't',
      tmbId: 'tmb',
      apiFileId: 'f1',
      datasetId: 'd1'
    });
    expect(res).toEqual({ title: 'cached.pdf', rawText: 'buffered text' });
  });

  it('getFileContent 缺失 content 与 previewUrl 报错', async () => {
    mocks.request.mockResolvedValueOnce(ok({}));
    await expect(
      provider().getFileContent({
        teamId: 't',
        tmbId: 'tmb',
        apiFileId: 'f1',
        datasetId: 'd1'
      })
    ).rejects.toBe('Invalid content type: content or previewUrl is required');
  });

  it('getFilePreviewUrl 校验无效 url 报错', async () => {
    mocks.request.mockResolvedValueOnce(ok({ url: '' }));
    await expect(provider().getFilePreviewUrl({ apiFileId: 'f1' })).rejects.toBe(
      'Invalid response url'
    );
  });

  it('getFileDetail 未找到文件时报错', async () => {
    mocks.request.mockResolvedValueOnce({ data: { success: true, data: null } });
    await expect(provider().getFileDetail({ apiFileId: 'not-exist' })).rejects.toBe(
      'File not found'
    );
  });

  it('getFileContent 从 previewUrl 中解析 fallback 标题', async () => {
    mocks.request
      .mockResolvedValueOnce(
        ok({ previewUrl: 'https://example.com/files/my-document.pdf?token=123' })
      )
      .mockRejectedValueOnce(new Error('no detail'));
    const res = await provider().getFileContent({
      teamId: 't',
      tmbId: 'tmb',
      apiFileId: 'f1',
      datasetId: 'd1'
    });
    expect(res.title).toBe('my-document.pdf');
  });
});
