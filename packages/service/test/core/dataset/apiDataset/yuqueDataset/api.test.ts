import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useYuqueDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/yuqueDataset/api';
import { createProxyAxios } from '@fastgpt/service/common/api/axios';
import { serviceEnv } from '@fastgpt/service/env';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@fastgpt/service/common/api/axios', () => ({
  createProxyAxios: vi.fn(() => ({ request }))
}));
const server = { token: 'token', userId: 'group' };
const provider = (basePath?: string) =>
  useYuqueDatasetRequest({ yuqueServer: { ...server, basePath } });
const ok = (data: unknown) => ({ data: { data } });
const toc = [
  {
    id: 10,
    uuid: 'parent-uuid',
    title: 'Parent',
    type: 'DOC',
    parent_uuid: '',
    child_uuid: 'child-uuid'
  },
  {
    id: 11,
    uuid: 'child-uuid',
    title: 'Child',
    type: 'DOC',
    parent_uuid: 'parent-uuid',
    child_uuid: ''
  },
  {
    id: 12,
    uuid: 'folder-uuid',
    title: 'Folder',
    type: 'TITLE',
    parent_uuid: '',
    child_uuid: 'nested-folder'
  },
  {
    id: 13,
    uuid: 'nested-folder',
    title: 'Nested',
    type: 'TITLE',
    parent_uuid: 'folder-uuid',
    child_uuid: ''
  },
  { id: 14, uuid: 'link-uuid', title: 'Link', type: 'LINK', parent_uuid: '' }
];
const repoPage = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `Repo ${i + 1}` }));
beforeEach(() => {
  vi.clearAllMocks();
  request.mockReset();
});

describe('useYuqueDatasetRequest', () => {
  it('配置 token、部署方基址和私有服务访问选项', () => {
    provider();
    expect(createProxyAxios).toHaveBeenCalledWith(
      {
        baseURL: serviceEnv.YUQUE_DATASET_BASE_URL,
        timeout: 60000,
        headers: { 'X-Auth-Token': 'token' }
      },
      false
    );
  });
});

describe('listFiles', () => {
  it.each([
    { success: false, message: 'token invalid' },
    { error: { message: 'quota exhausted' } }
  ])('HTTP 200 失败正文 %j 不能被当作空列表', async (data) => {
    request.mockResolvedValueOnce({ data });
    await expect(provider().listFiles({})).rejects.toEqual(data);
  });

  it.each([{ lastPage: [] }, { lastPage: [{ id: 101, name: 'Repo 101' }] }])(
    '知识库分页直到不足一页（末页 %j），ID 转成字符串',
    async ({ lastPage }) => {
      request.mockResolvedValueOnce(ok(repoPage)).mockResolvedValueOnce(ok(lastPage));
      const files = await provider().listFiles({});
      expect(files).toHaveLength(100 + lastPage.length);
      expect(files[0]).toMatchObject({
        id: '1',
        rawId: '1',
        type: 'folder',
        hasChild: true,
        parentId: null
      });
      expect(request.mock.calls.map(([args]) => args.params)).toEqual([
        { offset: 0, limit: 100 },
        { offset: 100, limit: 100 }
      ]);
    }
  );

  it('默认 basePath 与显式父级都按复合 ID 展开，保留文件夹和带子文档正文', async () => {
    request.mockResolvedValue(ok(toc));
    const api = provider('100');
    expect(await api.listFiles({})).toEqual([
      expect.objectContaining({
        id: '100-10-parent-uuid',
        rawId: 'parent-uuid',
        type: 'file',
        hasChild: true
      }),
      expect.objectContaining({ id: '100-12-folder-uuid', type: 'folder', hasChild: true })
    ]);
    expect(await api.listFiles({ parentId: '100-10-parent-uuid' })).toEqual([
      expect.objectContaining({ id: '100-11-child-uuid', type: 'file', hasChild: false })
    ]);
    expect(await api.listFiles({ parentId: '100-12-folder-uuid' })).toEqual([
      expect.objectContaining({ id: '100-13-nested-folder', type: 'folder', hasChild: false })
    ]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([{ data: 'not-array' }, { data: [{ id: '' }] }, { data: [{ id: 1 }] }])(
    '拒绝不合法知识库记录 %j',
    async ({ data }) => {
      request.mockResolvedValueOnce(ok(data));
      await expect(provider().listFiles({})).rejects.toBe('Invalid file data format');
    }
  );

  it('空响应拒绝、空知识库正常返回空列表', async () => {
    request.mockResolvedValueOnce({ data: undefined }).mockResolvedValueOnce(ok(undefined));
    const api = provider();
    await expect(api.listFiles({})).rejects.toEqual({ message: '服务器异常' });
    await expect(api.listFiles({})).resolves.toEqual([]);
  });

  it.each([
    [null, { message: '未知错误' }],
    ['failed', { message: 'failed' }],
    [new Error('failed'), new Error('failed')],
    [{ data: 'failed' }, { data: 'failed' }],
    [{ response: { data: { reason: 'failed' } } }, { response: { data: { reason: 'failed' } } }],
    [{ code: 'ECONNRESET' }, { code: 'ECONNRESET' }]
  ])('规范化请求错误 %#', async (error, expected) => {
    request.mockRejectedValueOnce(error);
    await expect(provider().listFiles({})).rejects.toEqual(expected);
  });
});

describe('getRepoToc（通过公开方法验证缓存）', () => {
  it('同实例并发和详情读取共享一次 TOC 请求，不同知识库与实例独立', async () => {
    request.mockResolvedValue(ok(toc));
    const api = provider();
    await Promise.all([
      api.listFiles({ parentId: '100' }),
      api.getFileDetail({ apiFileId: '100-10-parent-uuid' }),
      api.listFiles({ parentId: '100-10-parent-uuid' })
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    await api.listFiles({ parentId: '101' });
    await provider().listFiles({ parentId: '100' });
    expect(request.mock.calls.map(([args]) => args.url)).toEqual([
      '/api/v2/repos/100/toc',
      '/api/v2/repos/101/toc',
      '/api/v2/repos/100/toc'
    ]);
  });

  it('失败的 TOC Promise 不永久缓存，允许同实例重试', async () => {
    request.mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(ok(toc));
    const api = provider();
    await expect(api.listFiles({ parentId: '100' })).rejects.toThrow('failed');
    expect(await api.listFiles({ parentId: '100' })).toHaveLength(2);
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe('getFileDetail', () => {
  it.each([
    ['100-10-parent-uuid', '100', 'file', true],
    ['100-11-child-uuid', '100-10-parent-uuid', 'file', false],
    ['100-12-folder-uuid', '100', 'folder', true],
    ['100-13-nested-folder', '100-12-folder-uuid', 'folder', false]
  ])('详情 %s 的标识和层级与列表保持一致', async (id, parentId, type, hasChild) => {
    request.mockResolvedValue(ok(toc));
    const api = provider();
    const listed = await api.listFiles({ parentId: String(parentId) });
    expect(listed.some((item) => item.id === id)).toBe(true);
    expect(await api.getFileDetail({ apiFileId: String(id) })).toMatchObject({
      success: true,
      data: { id, parentId, type, hasChild }
    });
  });

  it.each(['101', 101])(
    '知识库 ID %s 兼容历史数字，分页后返回 folder 与字符串 ID',
    async (apiFileId) => {
      request
        .mockResolvedValueOnce(ok(repoPage))
        .mockResolvedValueOnce(ok([{ id: 101, name: 'Repo' }]));
      expect(await provider().getFileDetail({ apiFileId: apiFileId as string })).toMatchObject({
        success: true,
        data: { id: '101', rawId: '101', name: 'Repo', type: 'folder', hasChild: true }
      });
      expect(request.mock.calls[1][0].params.offset).toBe(100);
    }
  );

  it.each(['100', '100-missing-uuid'])(
    '不存在的知识库或 TOC 节点 %s resolve NOT_FOUND',
    async (apiFileId) => {
      request.mockResolvedValueOnce(ok([]));
      expect(await provider().getFileDetail({ apiFileId })).toEqual({
        success: false,
        code: 'NOT_FOUND',
        message: '文件不存在',
        status: 404
      });
    }
  );

  it('TOC 网络失败 resolve 失败，不能解释为不存在', async () => {
    request.mockRejectedValueOnce({ code: 'ECONNRESET' });
    expect(await provider().getFileDetail({ apiFileId: '100-10-parent-uuid' })).toMatchObject({
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
    request.mockRejectedValueOnce({
      message: 'Request failed',
      response: { status, data: { message: 'upstream resource not found' } }
    });
    expect(await provider().getFileDetail({ apiFileId: '100' })).toMatchObject({
      success: false,
      code,
      status,
      message: 'upstream resource not found'
    });
  });
});

describe('getFileContent', () => {
  it('复合 ID 中的 UUID 可以包含横杠，正文接口只使用 repoId 与 docId', async () => {
    request.mockResolvedValueOnce(ok({ title: 'Doc', body: 'body' }));
    await expect(provider().getFileContent({ apiFileId: '100-10-parent-uuid' })).resolves.toEqual({
      title: 'Doc',
      rawText: 'body'
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/v2/repos/100/docs/10', method: 'GET', params: {} })
    );
  });
  it('拒绝非字符串 ID 与缺少标题的文档', async () => {
    const api = provider();
    await expect(api.getFileContent({ apiFileId: 123 as unknown as string })).rejects.toBe(
      'Invalid file id'
    );
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce(ok({ title: '', body: 'body' }));
    await expect(api.getFileContent({ apiFileId: '100-10-uuid' })).rejects.toBe(
      'Cannot find the file'
    );
  });
});

describe('getFilePreviewUrl', () => {
  it('使用知识库与文档 slug 生成预览 URL', async () => {
    request.mockResolvedValueOnce(ok({ slug: 'repo' })).mockResolvedValueOnce(ok({ slug: 'doc' }));
    await expect(provider().getFilePreviewUrl({ apiFileId: '100-10-parent-uuid' })).resolves.toBe(
      `${serviceEnv.YUQUE_DATASET_BASE_URL}/group/repo/doc`
    );
  });
});

describe('getFileRawId', () => {
  it.each([
    ['100', '100'],
    ['100-10-parent-uuid', 'parent-uuid'],
    ['legacy', 'legacy']
  ])('%s 提取为 %s', (input, expected) => {
    expect(provider().getFileRawId(input)).toBe(expected);
  });
});
