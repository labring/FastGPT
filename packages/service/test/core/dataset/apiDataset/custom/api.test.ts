import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/custom/api';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  createProxyAxios: vi.fn(),
  read: vi.fn(),
  getBuffer: vi.fn(),
  addBuffer: vi.fn()
}));
vi.mock('@fastgpt/service/common/api/axios', () => ({
  createProxyAxios: (options: unknown) => {
    mocks.createProxyAxios(options);
    return { request: mocks.request };
  }
}));
vi.mock('@fastgpt/service/core/dataset/read', () => ({ readFileRawTextByUrl: mocks.read }));
vi.mock('@fastgpt/service/common/s3/sources/rawText', () => ({
  getS3RawTextSource: () => ({
    getRawTextBuffer: mocks.getBuffer,
    addRawTextBuffer: mocks.addBuffer
  })
}));
const provider = (basePath?: string) =>
  useApiDatasetRequest({
    apiServer: { baseUrl: 'https://api.example.com', authorization: 'token', basePath }
  });
const ok = (data: unknown) => ({ data: { success: true, data } });
const contentInput = { teamId: 'team', tmbId: 'member', apiFileId: 'file', datasetId: 'dataset' };
const hierarchyCases = [
  { type: 'folder', hasChild: undefined, expected: true },
  { type: 'file', hasChild: undefined, expected: false },
  { type: 'folder', hasChild: false, expected: false },
  { type: 'file', hasChild: true, expected: true }
];
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.getBuffer.mockResolvedValue(undefined);
  mocks.read.mockResolvedValue({ rawText: 'parsed' });
});

describe('useApiDatasetRequest baseUrl normalization', () => {
  it('prepends https for legacy bare domains so they no longer throw ERR_INVALID_URL', () => {
    // 历史配置常见只填域名；不补协议时 axios/URL 解析会在发请求前抛 ERR_INVALID_URL
    useApiDatasetRequest({
      apiServer: { baseUrl: 'api.example.com', authorization: 'token' } as any
    });

    expect(mocks.createProxyAxios).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.example.com' })
    );
  });

  it('trims surrounding whitespace', () => {
    useApiDatasetRequest({
      apiServer: { baseUrl: '  api.example.com  ', authorization: 'token' } as any
    });

    expect(mocks.createProxyAxios).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.example.com' })
    );
  });

  it('keeps an explicit http prefix', () => {
    useApiDatasetRequest({
      apiServer: { baseUrl: 'http://api.example.com', authorization: 'token' } as any
    });

    expect(mocks.createProxyAxios).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'http://api.example.com' })
    );
  });
});

describe('listFiles', () => {
  it.each([undefined, 'explicit'])('父级 %s 覆盖默认 basePath 并透传搜索词', async (parentId) => {
    mocks.request.mockResolvedValueOnce(ok([]));
    await expect(provider('base').listFiles({ parentId, searchKey: 'query' })).resolves.toEqual([]);
    expect(mocks.request).toHaveBeenCalledWith({
      url: '/v1/file/list',
      method: 'POST',
      data: { parentId: parentId ?? 'base', searchKey: 'query' },
      params: undefined
    });
  });
  it('删除未指定的请求字段，归一化 hasChild 且保留自定义字段', async () => {
    mocks.request.mockResolvedValueOnce(
      ok(
        hierarchyCases.map(({ type, hasChild }, i) => ({
          id: String(i),
          name: `Node ${i}`,
          type,
          hasChild,
          custom: i
        }))
      )
    );
    expect(await provider().listFiles({})).toEqual(
      hierarchyCases.map(({ type, expected }, i) => ({
        id: String(i),
        rawId: String(i),
        name: `Node ${i}`,
        type,
        hasChild: expected,
        custom: i
      }))
    );
    expect(mocks.request.mock.calls[0][0].data).toEqual({});
  });
  it.each([
    ['not-array', 'Invalid file list format'],
    [[{ id: '', name: 'Doc', type: 'file' }], 'Invalid file data format'],
    [[{ id: '1', name: '', type: 'file' }], 'Invalid file data format'],
    [[{ id: '1', name: 'Doc' }], 'Invalid file data format']
  ])('拒绝无效列表 %#', async (data, message) => {
    mocks.request.mockResolvedValueOnce(ok(data));
    await expect(provider().listFiles({})).rejects.toBe(message);
  });
  it.each([
    [{ data: undefined }, { message: '服务器异常' }],
    [
      { data: '<html>404 Not Found</html>' },
      { code: 'INVALID_RESPONSE', message: '服务器返回格式异常' }
    ],
    [{ data: { success: false, message: 'failed' } }, { success: false, message: 'failed' }]
  ])('响应协议错误 %#', async (response, error) => {
    mocks.request.mockResolvedValueOnce(response);
    await expect(provider().listFiles({})).rejects.toEqual(error);
  });
  it.each([
    [null, { message: '未知错误' }],
    ['failed', { message: 'failed' }],
    [new Error('failed'), new Error('failed')],
    [{ data: 'failed' }, { data: 'failed' }],
    [{ response: { data: { reason: 'failed' } } }, { response: { data: { reason: 'failed' } } }],
    [{ code: 'ECONNRESET' }, { code: 'ECONNRESET' }]
  ])('转换请求异常 %#', async (error, expected) => {
    mocks.request.mockRejectedValueOnce(error);
    await expect(provider().listFiles({})).rejects.toEqual(expected);
  });
});

describe('getFileDetail', () => {
  it.each(hierarchyCases)(
    '$type / hasChild=$hasChild 使用与列表一致的层级语义',
    async ({ type, hasChild, expected }) => {
      mocks.request.mockResolvedValueOnce(
        ok({
          id: 'file',
          name: 'Doc',
          parentId: null,
          type,
          hasChild,
          updateTime: 'updated',
          createTime: 'created'
        })
      );
      expect(await provider().getFileDetail({ apiFileId: 'file' })).toEqual({
        success: true,
        data: {
          id: 'file',
          rawId: 'file',
          name: 'Doc',
          parentId: '',
          type,
          hasChild: expected,
          updateTime: 'updated',
          createTime: 'created'
        }
      });
    }
  );
  it('保留有效父级 ID', async () => {
    mocks.request.mockResolvedValueOnce(
      ok({ id: 'file', name: 'Doc', parentId: 'parent', type: 'file' })
    );
    expect(await provider().getFileDetail({ apiFileId: 'file' })).toMatchObject({
      success: true,
      data: { parentId: 'parent' }
    });
  });
  it.each([[null], [undefined], [[]], ['not-object']])(
    '空详情或非对象 %j resolve INVALID_RESPONSE 而非 NOT_FOUND',
    async (data) => {
      mocks.request.mockResolvedValueOnce(ok(data));
      expect(await provider().getFileDetail({ apiFileId: 'file' })).toEqual({
        success: false,
        code: 'INVALID_RESPONSE',
        message: 'Invalid file detail response: empty data',
        status: undefined
      });
    }
  );
  it.each([
    ['错误 id', { id: 'other', name: 'Doc', type: 'folder' }, 'mismatched id'],
    ['缺少 id', { id: '', name: 'Doc', type: 'folder' }, 'mismatched id'],
    ['缺少 name', { id: 'file', name: '', type: 'folder' }, 'missing name'],
    ['非法 type', { id: 'file', name: 'Doc', type: 'unknown' }, 'invalid type']
  ])('详情关键字段异常（%s）resolve INVALID_RESPONSE', async (_label, data, reason) => {
    mocks.request.mockResolvedValueOnce(ok(data));
    expect(await provider().getFileDetail({ apiFileId: 'file' })).toMatchObject({
      success: false,
      code: 'INVALID_RESPONSE',
      message: expect.stringContaining(reason)
    });
  });
  it('HTML 等非协议 HTTP 200 响应不会按 not found 文案误判为 NOT_FOUND', async () => {
    mocks.request.mockResolvedValueOnce({ data: '<html>404 Not Found</html>' });
    expect(await provider().getFileDetail({ apiFileId: 'file' })).toMatchObject({
      success: false,
      code: 'INVALID_RESPONSE'
    });
  });
  it.each([
    ['Express 路由缺失', 'Cannot GET /v1/file/detail?id=file'],
    ['Nginx HTML 404', '<!doctype html><html><body>404 Not Found</body></html>'],
    ['Go 默认 404', '404 page not found\n'],
    ['FastAPI 默认 404', { detail: 'Not Found' }],
    ['Spring Boot 默认 404', { error: 'Not Found', path: '/v1/file/detail' }]
  ])('路由缺失 HTTP 404（%s）归类为 INVALID_RESPONSE 而非 NOT_FOUND', async (_label, data) => {
    mocks.request.mockRejectedValueOnce({
      message: 'Request failed with status code 404',
      response: { status: 404, data }
    });
    expect(await provider().getFileDetail({ apiFileId: 'file' })).toMatchObject({
      success: false,
      code: 'INVALID_RESPONSE',
      status: 404
    });
  });
  it('网络错误 resolve 失败', async () => {
    mocks.request.mockRejectedValueOnce({ code: 'ECONNRESET' });
    expect(await provider().getFileDetail({ apiFileId: 'file' })).toMatchObject({
      success: false,
      code: 'NETWORK_ERROR'
    });
  });
  it.each([
    [404, 'NOT_FOUND'],
    [403, 'UNAUTHORIZED'],
    [429, 'RATE_LIMIT'],
    [503, 'SERVER_ERROR']
  ])('真实 HTTP %s 状态穿过错误转换后仍可分类', async (status, code) => {
    mocks.request.mockRejectedValueOnce({
      message: 'Request failed',
      response: { status, data: { message: 'upstream resource not found' } }
    });
    expect(await provider().getFileDetail({ apiFileId: 'file' })).toMatchObject({
      success: false,
      code,
      status,
      message: 'upstream resource not found'
    });
  });
});

describe('getFileContent', () => {
  it('内联正文直接返回，不访问缓存或下载', async () => {
    mocks.request.mockResolvedValueOnce(ok({ title: 'Doc', content: 'inline' }));
    await expect(provider().getFileContent(contentInput)).resolves.toEqual({
      title: 'Doc',
      rawText: 'inline'
    });
    expect(mocks.getBuffer).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('下载透传计费与解析参数，并以最终标题写入缓存', async () => {
    const previewUrl = 'https://example.com/report.pdf';
    mocks.request.mockResolvedValueOnce(ok({ title: 'Report', previewUrl }));
    await expect(
      provider().getFileContent({ ...contentInput, customPdfParse: true, usageId: 'usage' })
    ).resolves.toEqual({ title: 'Report', rawText: 'parsed' });
    expect(mocks.read).toHaveBeenCalledWith({
      teamId: 'team',
      tmbId: 'member',
      relatedId: 'file',
      datasetId: 'dataset',
      url: previewUrl,
      customPdfParse: true,
      sangforFileParseConfig: undefined,
      usageId: 'usage',
      getFormatText: true
    });
    expect(mocks.addBuffer).toHaveBeenCalledWith({
      sourceId: previewUrl,
      sourceName: 'Report',
      text: 'parsed',
      customPdfParse: true,
      sangforFileParseConfig: undefined
    });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it.each([
    { title: 'Response', filename: 'cached.pdf', expected: 'Response' },
    { title: undefined, filename: 'cached.pdf', expected: 'cached.pdf' },
    { title: undefined, filename: '', expected: 'Detail' }
  ])('缓存命中标题优先级：$expected', async ({ title, filename, expected }) => {
    mocks.request
      .mockResolvedValueOnce(ok({ title, previewUrl: 'https://example.com/doc.pdf' }))
      .mockResolvedValueOnce(ok({ id: 'file', name: 'Detail', type: 'file' }));
    mocks.getBuffer.mockResolvedValueOnce({ filename, text: 'cached' });
    await expect(provider().getFileContent(contentInput)).resolves.toEqual({
      title: expected,
      rawText: 'cached'
    });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.addBuffer).not.toHaveBeenCalled();
  });
  it.each([
    ['https://example.com/a%20b.pdf?token=x#page=1', 'a b.pdf'],
    ['relative/file.pdf?token=x#page=1', 'file.pdf'],
    ['https://example.com/%ZZ.pdf', '%ZZ.pdf'],
    ['https://example.com/', undefined]
  ])('详情不可用时从 URL %s 回退标题', async (previewUrl, expected) => {
    mocks.request
      .mockResolvedValueOnce(ok({ previewUrl }))
      .mockRejectedValueOnce(new Error('detail unavailable'));
    const content = await provider().getFileContent(contentInput);
    expect(content.rawText).toBe('parsed');
    if (expected) expect(content.title).toBe(expected);
    else expect(content.title).toEqual(expect.stringMatching(/\S+/));
  });
  it('拒绝缺少正文和下载地址的响应', async () => {
    mocks.request.mockResolvedValueOnce(ok({}));
    await expect(provider().getFileContent(contentInput)).rejects.toBe(
      'Invalid content type: content or previewUrl is required'
    );
  });
});

describe('getFilePreviewUrl', () => {
  it('返回预览 URL', async () => {
    mocks.request.mockResolvedValueOnce(ok({ url: 'https://example.com/preview' }));
    await expect(provider().getFilePreviewUrl({ apiFileId: 'file' })).resolves.toBe(
      'https://example.com/preview'
    );
    expect(mocks.request.mock.calls[0][0]).toMatchObject({
      url: '/v1/file/read',
      method: 'GET',
      params: { id: 'file' }
    });
  });
  it.each(['', 123])('拒绝非法 URL %j', async (url) => {
    mocks.request.mockResolvedValueOnce(ok({ url }));
    await expect(provider().getFilePreviewUrl({ apiFileId: 'file' })).rejects.toBe(
      'Invalid response url'
    );
  });
});

describe('getFileRawId', () => {
  it('保留原始 ID', () => expect(provider().getFileRawId('file')).toBe('file'));
});
