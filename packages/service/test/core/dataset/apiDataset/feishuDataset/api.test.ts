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
    mocks.post.mockResolvedValueOnce({ data: { tenant_access_token: 'token' } });
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

describe('listFiles', () => {
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

  it.each([{ metas: [] }, { metas: undefined }])(
    '空 metas (%j) 仍尝试 folder',
    async ({ metas }) => {
      mocks.request
        .mockResolvedValueOnce(ok({ metas }))
        .mockResolvedValueOnce(ok({ metas: [{ title: 'Folder', doc_type: 'folder' }] }));
      expect(await provider().getFileDetail({ apiFileId: 'token' })).toMatchObject({
        success: true,
        data: { type: 'folder' }
      });
      expect(mocks.request).toHaveBeenCalledTimes(2);
    }
  );

  it.each(['empty', '404'])('两次探测都 %s 时返回明确 NOT_FOUND', async (failure) => {
    if (failure === 'empty') mocks.request.mockResolvedValue(ok({ metas: [] }));
    else mocks.request.mockRejectedValue({ status: 404 });
    expect(await provider().getFileDetail({ apiFileId: 'gone' })).toEqual({
      success: false,
      code: 'NOT_FOUND',
      message: '文件不存在',
      status: 404
    });
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it.each([
    [503, 'SERVER_ERROR'],
    [429, 'RATE_LIMIT'],
    [403, 'UNAUTHORIZED'],
    [401, 'UNAUTHORIZED']
  ])('任意探测阶段的 HTTP %i 都 resolve 失败且停止继续探测', async (status, code) => {
    for (const stage of [0, 1]) {
      mocks.request.mockReset();
      if (stage) mocks.request.mockResolvedValueOnce(ok({ metas: [] }));
      mocks.request.mockRejectedValueOnce({ response: { status } });
      expect(await provider().getFileDetail({ apiFileId: 'token' })).toMatchObject({
        success: false,
        code,
        status
      });
      expect(mocks.request).toHaveBeenCalledTimes(stage + 1);
    }
  });

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
