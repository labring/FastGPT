import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeishuDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/feishuDataset/api';
import { createProxyAxios } from '@fastgpt/service/common/api/axios';
import { serviceEnv } from '@fastgpt/service/env';

const mocks = vi.hoisted(() => ({ request: vi.fn(), post: vi.fn(), use: vi.fn() }));
vi.mock('@fastgpt/service/common/api/axios', () => ({
  axiosWithoutSSRF: { post: mocks.post },
  createProxyAxios: vi.fn(() => ({
    request: mocks.request,
    interceptors: { request: { use: mocks.use } }
  }))
}));

const server = { appId: 'app', appSecret: 'secret', folderToken: 'root' };
const provider = () => useFeishuDatasetRequest({ feishuServer: server });
const ok = (data: unknown) => ({ data: { code: 0, data } });
const failed = (code: number, token = 'token') => ok({ metas: [], failed_list: [{ token, code }] });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockReset();
  mocks.post.mockReset();
});

describe('useFeishuDatasetRequest', () => {
  it('配置部署方基址、禁用 SSRF 拦截并通过专用客户端换取租户 token', async () => {
    provider();
    expect(createProxyAxios).toHaveBeenCalledWith(
      { baseURL: serviceEnv.FEISHU_BASE_URL, timeout: 60000 },
      false
    );
    mocks.post.mockResolvedValueOnce({ data: { code: 0, tenant_access_token: 'token' } });
    const interceptor = mocks.use.mock.calls[0][0];
    await expect(interceptor({ headers: {} })).resolves.toEqual({
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json; charset=utf-8' }
    });
    expect(mocks.post).toHaveBeenCalledWith(
      `${serviceEnv.FEISHU_BASE_URL}/open-apis/auth/v3/tenant_access_token/internal`,
      { app_id: 'app', app_secret: 'secret' }
    );
    const authorized = { headers: { Authorization: 'Bearer existing' } };
    await expect(interceptor(authorized)).resolves.toBe(authorized);
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
});

describe('飞书租户 Token 错误', () => {
  it.each([
    { code: 10003, msg: 'app secret invalid' },
    { code: 1069701, msg: 'tenant token invalid' },
    { code: 1069704, msg: 'service unavailable' }
  ])('HTTP 200 业务失败保留原因：$msg', async (data) => {
    provider();
    mocks.post.mockResolvedValueOnce({ data });
    const config = { headers: {} };
    await expect(mocks.use.mock.calls[0][0](config)).rejects.toMatchObject({
      code: data.code,
      message: data.msg
    });
    expect(config.headers).toEqual({});
  });

  it.each([undefined, null])('缺失 Token 响应 %j 返回可读错误', async (data) => {
    provider();
    mocks.post.mockResolvedValueOnce({ data });
    await expect(mocks.use.mock.calls[0][0]({ headers: {} })).rejects.toBe('服务器异常');
  });

  it.each([undefined, '', '  ', 123])(
    '业务成功但 Token=%j 时不使用 Bearer undefined',
    async (token) => {
      provider();
      mocks.post.mockResolvedValueOnce({ data: { code: 0, tenant_access_token: token } });
      const config = { headers: {} };
      await expect(mocks.use.mock.calls[0][0](config)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: expect.stringContaining('有效 Token')
      });
      expect(config.headers).toEqual({});
    }
  );

  it('Token 端点的 HTTP 404 不能作为文件删除依据，也不继续探测 folder', async () => {
    mocks.post.mockRejectedValue({
      response: { status: 404, data: { msg: 'tenant token endpoint not found' } }
    });
    mocks.request.mockImplementation(async () => mocks.use.mock.calls[0][0]({ headers: {} }));
    expect(await provider().getFileDetail({ apiFileId: 'token' })).toMatchObject({
      success: false,
      code: 'UNKNOWN_ERROR',
      message: 'tenant token endpoint not found'
    });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
});

describe('listFiles', () => {
  it.each([undefined, {}, { files: 'not-array' }])(
    'code=0 但列表缺失或格式错误 %j 时返回具体错误',
    async (data) => {
      mocks.request.mockResolvedValueOnce(ok(data));
      await expect(provider().listFiles({})).rejects.toThrow('飞书文件列表响应缺失或格式错误');
    }
  );

  it('飞书 HTTP 200 业务失败的 msg 不被 HTTP 通用文案覆盖', async () => {
    mocks.request.mockResolvedValueOnce({ data: { code: 1069701, msg: 'tenant token expired' } });
    await expect(provider().listFiles({})).rejects.toMatchObject({
      message: 'tenant token expired',
      status: 401
    });
  });

  it.each([undefined, 'subfolder'])(
    '分页携带父 token %s，过滤不支持的类型并转换秒级时间戳',
    async (parentId) => {
      const files = ['folder', 'image', 'docx'].map((type) => ({
        token: type,
        parent_token: 'parent',
        name: type,
        type,
        modified_time: 1700000000,
        created_time: 1600000000
      }));
      mocks.request
        .mockResolvedValueOnce(
          ok({ files: files.slice(0, 2), has_more: true, next_page_token: 'page2' })
        )
        .mockResolvedValueOnce(ok({ files: files.slice(2), has_more: false }));
      expect(await provider().listFiles({ parentId })).toEqual([
        expect.objectContaining({
          id: 'folder',
          rawId: 'folder',
          parentId: 'parent',
          type: 'folder',
          hasChild: true,
          updateTime: new Date(1700000000000),
          createTime: new Date(1600000000000)
        }),
        expect.objectContaining({ id: 'docx', type: 'file', hasChild: false })
      ]);
      expect(mocks.request.mock.calls.map(([args]) => args.params)).toEqual([
        { folder_token: parentId ?? 'root', page_size: 200 },
        { folder_token: parentId ?? 'root', page_size: 200, page_token: 'page2' }
      ]);
    }
  );

  it.each([
    ['字符串', 'failed', { message: 'failed' }],
    ['空错误', null, { message: '未知错误' }],
    ['HTTP 错误', { response: { status: 503 } }, { response: { status: 503 } }]
  ])('请求失败保留 %s 的错误语义', async (_, error, expected) => {
    mocks.request.mockRejectedValueOnce(error);
    await expect(provider().listFiles({})).rejects.toEqual(expected);
  });

  it('拒绝空响应', async () => {
    mocks.request.mockResolvedValueOnce({ data: undefined });
    await expect(provider().listFiles({})).rejects.toEqual({ message: '服务器异常' });
  });
});

describe('getFileDetail', () => {
  it.each(['docx', 'folder'])('把 %s 元数据转换为统一详情', async (docType) => {
    if (docType === 'folder') mocks.request.mockRejectedValueOnce({ response: { status: 404 } });
    mocks.request.mockResolvedValueOnce(ok({ metas: [{ title: 'Title', doc_type: docType }] }));
    expect(await provider().getFileDetail({ apiFileId: 'token' })).toEqual({
      success: true,
      data: {
        id: 'token',
        rawId: 'token',
        name: 'Title',
        parentId: null,
        type: docType === 'folder' ? 'folder' : 'file',
        hasChild: docType === 'folder',
        updateTime: expect.any(Date),
        createTime: expect.any(Date)
      }
    });
    expect(mocks.request.mock.calls.map(([args]) => args.data.request_docs)).toEqual(
      (docType === 'folder' ? ['docx', 'folder'] : ['docx']).map((type) => [
        { doc_token: 'token', doc_type: type }
      ])
    );
    expect(
      mocks.request.mock.calls.every(
        ([args]) => args.url === '/open-apis/drive/v1/metas/batch_query'
      )
    ).toBe(true);
  });

  it('飞书 970005 类型不匹配时按 folder 重试并保留文件夹', async () => {
    mocks.request
      .mockResolvedValueOnce(failed(970005))
      .mockResolvedValueOnce(ok({ metas: [{ title: 'Folder', doc_type: 'folder' }] }));
    expect(await provider().getFileDetail({ apiFileId: 'token' })).toMatchObject({
      success: true,
      data: { type: 'folder' }
    });
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it.each(['970005', '404'])('两种类型都明确返回 %s 时才返回 NOT_FOUND', async (failure) => {
    if (failure === '970005') mocks.request.mockResolvedValue(failed(970005));
    else mocks.request.mockRejectedValue({ status: 404 });
    expect(await provider().getFileDetail({ apiFileId: 'token' })).toEqual({
      success: false,
      code: 'NOT_FOUND',
      message: '文件不存在',
      status: 404
    });
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it.each([
    [failed(970003), 'UNAUTHORIZED'],
    [failed(970002), 'UNKNOWN_ERROR'],
    [failed(999999), 'UNKNOWN_ERROR'],
    [failed(970005, 'another-token'), 'UNKNOWN_ERROR'],
    [ok({ metas: [] }), 'UNKNOWN_ERROR'],
    [ok({}), 'UNKNOWN_ERROR'],
    [ok(undefined), 'UNKNOWN_ERROR'],
    [ok({ metas: [{ title: 'wrong-type', doc_type: 'image' }] }), 'UNKNOWN_ERROR'],
    [ok({ metas: [{ doc_type: 'folder' }] }), 'UNKNOWN_ERROR'],
    [{ data: { code: 1069701, msg: 'not found' } }, 'UNAUTHORIZED'],
    [{ data: { code: 1069704, msg: 'not found' } }, 'SERVER_ERROR'],
    [{ data: { code: 1234, msg: 'not found' } }, 'UNKNOWN_ERROR'],
    [{ data: { code: 1234 } }, 'UNKNOWN_ERROR']
  ])('任一阶段的权限、未知业务错误或不完整结果 %# 都阻止删除', async (response, code) => {
    for (const stage of [0, 1]) {
      mocks.request.mockReset();
      if (stage) mocks.request.mockResolvedValueOnce(failed(970005));
      mocks.request.mockResolvedValueOnce(response);
      expect(await provider().getFileDetail({ apiFileId: 'token' })).toMatchObject({
        success: false,
        code
      });
      expect(mocks.request).toHaveBeenCalledTimes(stage + 1);
    }
  });

  it.each([
    [503, 'SERVER_ERROR'],
    [429, 'RATE_LIMIT'],
    [403, 'UNAUTHORIZED'],
    [401, 'UNAUTHORIZED']
  ])('任意探测阶段的 HTTP %i 都 resolve 失败且停止继续探测', async (status, code) => {
    for (const stage of [0, 1]) {
      mocks.request.mockReset();
      if (stage) mocks.request.mockResolvedValueOnce(failed(970005));
      mocks.request.mockRejectedValueOnce({ response: { status } });
      expect(await provider().getFileDetail({ apiFileId: 'token' })).toMatchObject({
        success: false,
        code,
        status
      });
      expect(mocks.request).toHaveBeenCalledTimes(stage + 1);
    }
  });

  it.each([new Error('not found'), '文件不存在', { code: 'NOT_FOUND', message: 'missing' }])(
    '没有 HTTP 404 的错误 %j 不能作为飞书删除依据',
    async (error) => {
      mocks.request.mockRejectedValueOnce(error);
      expect(await provider().getFileDetail({ apiFileId: 'token' })).toMatchObject({
        success: false,
        code: 'UNKNOWN_ERROR'
      });
      expect(mocks.request).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['ECONNRESET', 'ETIMEDOUT'])('网络错误 %s 不判定为删除', async (code) => {
    mocks.request.mockRejectedValueOnce({ code });
    expect(await provider().getFileDetail({ apiFileId: 'token' })).toMatchObject({
      success: false,
      code: 'NETWORK_ERROR'
    });
  });
});

describe('getFileContent', () => {
  it.each([{ title: 'Title' }, undefined])('并行读取正文和可选标题 %j', async (document) => {
    mocks.request
      .mockResolvedValueOnce(ok({ content: 'body' }))
      .mockResolvedValueOnce(ok({ document }));
    await expect(provider().getFileContent({ apiFileId: 'doc' })).resolves.toEqual({
      title: document?.title,
      rawText: 'body'
    });
    expect(mocks.request.mock.calls.map(([args]) => args.url)).toEqual([
      '/open-apis/docx/v1/documents/doc/raw_content',
      '/open-apis/docx/v1/documents/doc'
    ]);
  });
});

describe('getFilePreviewUrl', () => {
  it('通过带 with_url 的元数据请求读取预览链接', async () => {
    mocks.request.mockResolvedValueOnce(ok({ metas: [{ url: 'https://feishu.cn/docx/token' }] }));
    await expect(provider().getFilePreviewUrl({ apiFileId: 'token' })).resolves.toBe(
      'https://feishu.cn/docx/token'
    );
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        data: { request_docs: [{ doc_token: 'token', doc_type: 'docx' }], with_url: true }
      })
    );
  });
});

describe('getFileRawId', () => {
  it('保留原始 token', () => expect(provider().getFileRawId('token')).toBe('token'));
});
