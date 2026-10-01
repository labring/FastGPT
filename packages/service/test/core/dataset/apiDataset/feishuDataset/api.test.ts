import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequest, mockAxiosPost } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockAxiosPost: vi.fn()
}));

vi.mock('../../../../../common/api/axios', () => ({
  axios: { post: mockAxiosPost },
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

    expect(detail).toMatchObject({
      id: 'fld-sub',
      rawId: 'fld-sub',
      name: 'Sub Folder',
      type: 'folder',
      hasChild: true
    });
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

    await expect(request.getFileDetail({ apiFileId: 'fld-empty-result' })).resolves.toMatchObject({
      name: 'Empty-result Folder',
      type: 'folder',
      hasChild: true
    });
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

    expect(detail).toMatchObject({ name: 'Doc', type: 'file', hasChild: false });
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

    await expect(request.getFileDetail({ apiFileId: 'gone' })).rejects.toBe('文件不存在');
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });
});
