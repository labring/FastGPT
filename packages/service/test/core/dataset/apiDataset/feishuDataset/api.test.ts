import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequest, mockAxiosPost } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockAxiosPost: vi.fn()
}));

vi.mock('../../../../../common/api/axios', () => ({
  axios: { post: mockAxiosPost },
  axiosWithoutSSRF: { post: mockAxiosPost },
  createProxyAxios: vi.fn(() => ({
    request: mockRequest,
    interceptors: { request: { use: vi.fn() } }
  }))
}));

vi.mock('../../../../../common/logger', () => ({
  getLogger: () => ({
    warn: vi.fn(),
    error: vi.fn()
  }),
  LogCategories: {
    MODULE: {
      DATASET: {
        API_DATASET: 'dataset.apiDataset'
      }
    }
  }
}));

import { useFeishuDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/feishuDataset/api';

/** 飞书响应体固定包一层 { success, message, data }，request 内部只取 data */
const ok = (data: unknown) => ({ data: { success: true, message: 'ok', data } });

const server = {
  appId: 'cli-app',
  appSecret: 'app-secret',
  folderToken: 'fld-root'
} as any;

/** 按 doc_type 返回 metas；未配置的类型直接 reject，模拟飞书对类型不匹配的 token 报错 */
const mockMetasByType = (
  byType: Record<string, { title: string; doc_type: string } | undefined>
) => {
  mockRequest.mockImplementation(({ url, data }: any) => {
    if (url !== '/open-apis/drive/v1/metas/batch_query') {
      throw new Error(`unexpected url ${url}`);
    }
    const docType = data.request_docs[0].doc_type;
    const meta = byType[docType];
    return meta ? Promise.resolve(ok({ metas: [meta] })) : Promise.reject(new Error('not found'));
  });
};

describe('useFeishuDatasetRequest.getFileDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * 被测函数名: useFeishuDatasetRequest.getFileDetail  等级: 3-High
   * 思路（回归场景）: 旧实现直接调 `/open-apis/docx/v1/documents/{token}`，该接口只认云文档，
   * 传 folder token 必定报错。同步流程会对每个本地根节点调一次 getFileDetail，
   * 于是「只同步一个子文件夹」整轮失败，且失败发生在删除判定之前（整轮中止）。
   * 本用例钉住：文件夹也要能取到详情，且走的是 metas 接口而不是 docx 详情接口。
   */
  it('folder token 也能取到详情，且不调 docx 详情接口', async () => {
    mockMetasByType({ folder: { title: 'Sub Folder', doc_type: 'folder' } });
    const request = useFeishuDatasetRequest({ feishuServer: server });

    const detail = await request.getFileDetail({ apiFileId: 'fld-sub' });
    expect(detail.success).toBe(true);
    if (detail.success) {
      expect(detail.data).toMatchObject({
        id: 'fld-sub',
        rawId: 'fld-sub',
        name: 'Sub Folder',
        type: 'folder',
        hasChild: true
      });
    }
    const urls = mockRequest.mock.calls.map((call) => call[0].url);
    // docx 查不到才回退 folder，故是两次 metas 查询，且都不碰 docx 详情接口
    expect(urls).toEqual([
      '/open-apis/drive/v1/metas/batch_query',
      '/open-apis/drive/v1/metas/batch_query'
    ]);
    expect(mockRequest.mock.calls.map((call) => call[0].data.request_docs[0].doc_type)).toEqual([
      'docx',
      'folder'
    ]);
    expect(urls.some((url) => url.includes('/docx/v1/documents/'))).toBe(false);
  });

  /**
   * 被测函数名: useFeishuDatasetRequest.getFileDetail  等级: 3-High
   * 思路（边界场景）: batch_query 在 doc_type 不匹配时可能正常返回空 metas，而不是 reject；
   * 这种响应也必须继续查询 folder，不能直接把真实文件夹判为不存在。
   */
  it('docx 查询成功但 metas 为空时继续回退 folder', async () => {
    mockRequest
      .mockResolvedValueOnce(ok({ metas: [] }))
      .mockResolvedValueOnce(ok({ metas: [{ title: 'Empty-result Folder', doc_type: 'folder' }] }));
    const request = useFeishuDatasetRequest({ feishuServer: server });

    const detail = await request.getFileDetail({ apiFileId: 'fld-empty-result' });
    expect(detail.success).toBe(true);
    if (detail.success) {
      expect(detail.data).toMatchObject({
        name: 'Empty-result Folder',
        type: 'folder',
        hasChild: true
      });
    }
    expect(mockRequest.mock.calls.map((call) => call[0].data.request_docs[0].doc_type)).toEqual([
      'docx',
      'folder'
    ]);
  });

  /**
   * 被测函数名: useFeishuDatasetRequest.getFileDetail  等级: 3-High
   * 思路（正常场景）: 云文档按 docx 查得即可，不必回退到 folder
   */
  it('docx token 首次查询即命中，不回退 folder', async () => {
    mockMetasByType({ docx: { title: 'Doc', doc_type: 'docx' } });
    const request = useFeishuDatasetRequest({ feishuServer: server });

    const detail = await request.getFileDetail({ apiFileId: 'doc-token' });
    expect(detail.success).toBe(true);
    if (detail.success) {
      expect(detail.data).toMatchObject({ name: 'Doc', type: 'file', hasChild: false });
    }
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest.mock.calls[0][0].data.request_docs[0].doc_type).toBe('docx');
  });

  /**
   * 被测函数名: useFeishuDatasetRequest.getFileDetail  等级: 3-High
   * 思路（异常场景）: 两种类型都查不到（token 真的被删了）时 reject，
   * 否则同步会把「已删除」判成「仍存在」，节点永远留不下来也删不掉
   */
  it('两种 doc_type 都查不到时 reject', async () => {
    mockMetasByType({});
    const request = useFeishuDatasetRequest({ feishuServer: server });

    const res = await request.getFileDetail({ apiFileId: 'gone' });
    expect(res).toEqual({ success: false, code: 'NOT_FOUND', message: '文件不存在', status: 404 });
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('遇到 503 与 ECONNRESET 等服务/网络异常时不转成文件不存在，而是直接抛错中止', async () => {
    mockRequest.mockRejectedValueOnce(
      Object.assign(new Error('Service Unavailable'), { status: 503 })
    );
    const request = useFeishuDatasetRequest({ feishuServer: server });

    const down = await request.getFileDetail({ apiFileId: 'server-down' });
    expect(down).toMatchObject({ success: false, code: 'SERVER_ERROR', status: 503 });
    expect(mockRequest).toHaveBeenCalledTimes(1);

    mockRequest.mockRejectedValueOnce({ code: 'ECONNRESET' });
    const reset = await request.getFileDetail({ apiFileId: 'conn-reset' });
    expect(reset).toMatchObject({ success: false, code: 'NETWORK_ERROR' });
  });

  describe('listFiles, getFileContent, getFilePreviewUrl, getFileRawId', () => {
    it('listFiles 支持多页分页递归拉取并过滤非 folder/docx 类型', async () => {
      mockRequest
        .mockResolvedValueOnce(
          ok({
            files: [
              {
                token: 'f1',
                parent_token: 'root',
                name: 'Folder 1',
                type: 'folder',
                modified_time: 1700000,
                created_time: 1700000
              },
              {
                token: 'img1',
                parent_token: 'root',
                name: 'image.png',
                type: 'image',
                modified_time: 1700000,
                created_time: 1700000
              }
            ],
            has_more: true,
            next_page_token: 'page-2'
          })
        )
        .mockResolvedValueOnce(
          ok({
            files: [
              {
                token: 'd1',
                parent_token: 'root',
                name: 'Doc 1',
                type: 'docx',
                modified_time: 1700000,
                created_time: 1700000
              }
            ],
            has_more: false
          })
        );

      const request = useFeishuDatasetRequest({ feishuServer: server });
      const files = await request.listFiles({});

      expect(files).toHaveLength(2);
      expect(files[0]).toMatchObject({ id: 'f1', type: 'folder', hasChild: true });
      expect(files[1]).toMatchObject({ id: 'd1', type: 'file', hasChild: false });
    });

    it('getFileContent 读取文档正文与标题', async () => {
      mockRequest
        .mockResolvedValueOnce(ok({ content: 'Markdown document content' }))
        .mockResolvedValueOnce(ok({ document: { title: 'Doc Title' } }));

      const request = useFeishuDatasetRequest({ feishuServer: server });
      const result = await request.getFileContent({ apiFileId: 'doc-token' });

      expect(result).toEqual({
        title: 'Doc Title',
        rawText: 'Markdown document content'
      });
    });

    it('getFilePreviewUrl 获取预览链接', async () => {
      mockRequest.mockResolvedValueOnce(
        ok({
          metas: [{ url: 'https://feishu.cn/docx/doc-token' }]
        })
      );

      const request = useFeishuDatasetRequest({ feishuServer: server });
      const url = await request.getFilePreviewUrl({ apiFileId: 'doc-token' });

      expect(url).toBe('https://feishu.cn/docx/doc-token');
    });

    it('getFileRawId 返回原始 token', () => {
      const request = useFeishuDatasetRequest({ feishuServer: server });
      expect(request.getFileRawId('raw-token')).toBe('raw-token');
    });
    it('空响应返回服务器异常', async () => {
      mockRequest.mockResolvedValueOnce({ data: undefined });
      const request = useFeishuDatasetRequest({ feishuServer: server });
      await expect(request.listFiles({})).rejects.toEqual({ message: '服务器异常' });
    });

    it('处理不同形态的请求错误', async () => {
      mockRequest.mockRejectedValueOnce('string error');
      const request = useFeishuDatasetRequest({ feishuServer: server });
      await expect(request.listFiles({})).rejects.toEqual({ message: 'string error' });

      mockRequest.mockRejectedValueOnce(null);
      await expect(request.listFiles({})).rejects.toEqual({ message: '未知错误' });

      mockRequest.mockRejectedValueOnce({ data: 'error data string' });
      await expect(request.listFiles({})).rejects.toEqual({ data: 'error data string' });
    });

    it('请求拦截器注入 tenant_access_token', async () => {
      let interceptorHook: any;
      const { createProxyAxios } = await import('../../../../../common/api/axios');
      (createProxyAxios as any).mockImplementationOnce(() => ({
        request: mockRequest,
        interceptors: {
          request: {
            use: (fn: any) => {
              interceptorHook = fn;
            }
          }
        }
      }));
      mockAxiosPost.mockResolvedValueOnce({ data: { tenant_access_token: 'fresh-token' } });
      useFeishuDatasetRequest({ feishuServer: server });
      expect(interceptorHook).toBeDefined();
      const config = await interceptorHook({ headers: {} });
      expect(config.headers['Authorization']).toBe('Bearer fresh-token');
    });
  });
});
