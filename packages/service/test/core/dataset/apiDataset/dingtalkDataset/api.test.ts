import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDingtalkDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/dingtalkDataset/api';
import type { DingtalkServerType } from '@fastgpt/global/core/dataset/apiDataset/type';

const mocks = vi.hoisted(() => ({ post: vi.fn(), request: vi.fn() }));
vi.mock('@fastgpt/service/common/api/axios', () => ({
  axiosWithoutSSRF: { post: mocks.post },
  createProxyAxios: () => ({ request: mocks.request })
}));

const server = { appKey: 'ding-app', appSecret: 'ding-secret', userId: 'user' };
const provider = (config: Partial<DingtalkServerType> = {}) =>
  useDingtalkDatasetRequest({ dingtalkServer: { ...server, ...config } });
const doc = { nodeId: 'doc', title: 'Doc', docType: 'wiki_doc', parentNodeId: 'root' };
const ok = (data: unknown) => ({ data });
const nodePermissionError =
  '读取钉钉目录失败，请检查 rootNodeId、Wiki.Node.Read 权限和知识库访问权限';
const rateLimitError = '钉钉目录接口请求过快，请稍后重试或减少一次导入的文件夹规模';

beforeEach(() => {
  mocks.request.mockReset();
  mocks.post
    .mockReset()
    .mockImplementation(async (url: string) =>
      ok(
        url.includes('/oauth2/accessToken')
          ? { accessToken: 'token', expireIn: 7200 }
          : { errcode: 0, result: { unionid: 'operator' } }
      )
    );
});
afterEach(() => vi.useRealTimers());

describe('listFiles', () => {
  it('无 rootNodeId 时列知识库，分页携带 nextToken 与鉴权头', async () => {
    mocks.request
      .mockResolvedValueOnce(
        ok({
          workspaces: [{ workspaceId: 'space1', workspaceName: 'Space', rootNodeId: 'root1' }],
          nextToken: 'page2'
        })
      )
      .mockResolvedValueOnce(
        ok({ workspaces: [{ workspaceId: 'space2', name: 'Space 2', rootNodeId: 'root2' }] })
      );
    expect(await provider().listFiles({})).toEqual([
      expect.objectContaining({
        id: 'root1',
        rawId: 'root1',
        name: 'Space',
        parentId: 'operator',
        type: 'folder',
        hasChild: true
      }),
      expect.objectContaining({ id: 'root2', name: 'Space 2', type: 'folder' })
    ]);
    expect(mocks.request.mock.calls.map(([args]) => args.params)).toEqual([
      { operatorId: 'operator', maxResults: 100 },
      { operatorId: 'operator', maxResults: 100, nextToken: 'page2' }
    ]);
    expect(mocks.request.mock.calls[0][0]).toMatchObject({
      url: '/v2.0/wiki/workspaces',
      method: 'GET',
      headers: { 'x-acs-dingtalk-access-token': 'token' }
    });
  });

  it.each([undefined, 'explicit'])(
    '父级 %s 优先于配置根目录，分页过滤非文档节点',
    async (parentId) => {
      mocks.request
        .mockResolvedValueOnce(
          ok({
            nodes: [
              { nodeId: 'folder', title: 'Folder', nodeType: 'folder' },
              { ...doc, hasChildren: true }
            ],
            nextToken: 'page2'
          })
        )
        .mockResolvedValueOnce(
          ok({
            nodes: [
              { nodeId: 'leaf', title: 'Leaf', docType: 'wiki_doc' },
              { nodeId: 'pdf', title: 'PDF', fileType: 'pdf' },
              { nodeId: 'nameless', nodeType: 'catalog' },
              { title: 'No ID', type: 'folder' }
            ]
          })
        );
      expect(await provider({ rootNodeId: 'root' }).listFiles({ parentId })).toEqual([
        expect.objectContaining({ id: 'folder', type: 'folder', hasChild: true }),
        expect.objectContaining({ id: 'doc', type: 'file', hasChild: true }),
        expect.objectContaining({ id: 'leaf', type: 'file', hasChild: false })
      ]);
      expect(mocks.request.mock.calls.map(([args]) => args.params.parentNodeId)).toEqual([
        parentId ?? 'root',
        parentId ?? 'root'
      ]);
      expect(mocks.request.mock.calls[1][0].params.nextToken).toBe('page2');
    }
  );

  it.each(['items', 'list'])('兼容 %s 列表字段与历史知识库 ID 字段', async (field) => {
    mocks.request.mockResolvedValueOnce(
      ok({
        [field]: [
          { id: 's1', rootDentryUuid: 'r1', name: 'One' },
          { spaceId: 's2', rootDentryId: 'r2' },
          { workspaceId: 's3', nodeId: 'r3' },
          { workspaceId: 's4', dentryUuid: 'r4' },
          { workspaceId: 'invalid' },
          { rootNodeId: 'invalid' }
        ]
      })
    );
    expect((await provider().listFiles({})).map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'r1', name: 'One' },
      { id: 'r2', name: 's2' },
      { id: 'r3', name: 's3' },
      { id: 'r4', name: 's4' }
    ]);
  });

  it('兼容各节点 ID、在线文档类型、日期单位和父 ID 字段', async () => {
    const timestamp = 1700000000000;
    mocks.request.mockResolvedValueOnce(
      ok({
        nodes: [
          {
            dentryUuid: '1',
            name: 'Directory',
            type: 'directory',
            parentId: 'parent',
            modifiedTime: timestamp / 1000,
            createTime: '2024-01-01'
          },
          {
            dentryId: '2',
            name: 'Catalog',
            nodeType: 'catalog',
            updatedAt: timestamp,
            createdAt: timestamp
          },
          { uuid: '3', title: 'Document', docType: 'document', hasChild: true },
          { id: '4', title: 'Doc', extension: 'doc' },
          { nodeId: '5', name: 'Adoc', fileType: 'adoc' }
        ]
      })
    );
    const nodes = await provider().listFiles({ parentId: 'root' });
    expect(nodes.map(({ id, type, hasChild }) => [id, type, hasChild])).toEqual([
      ['1', 'folder', true],
      ['2', 'folder', true],
      ['3', 'file', true],
      ['4', 'file', false],
      ['5', 'file', false]
    ]);
    expect(nodes[0]).toMatchObject({
      parentId: 'parent',
      updateTime: new Date(timestamp),
      createTime: new Date('2024-01-01')
    });
    expect(nodes[1]).toMatchObject({
      updateTime: new Date(timestamp),
      createTime: new Date(timestamp)
    });
    expect(nodes[2].createTime).toBeInstanceOf(Date);
  });

  it('按 workspaceName/name 与 title/name 搜索，缺少名称的节点不命中', async () => {
    mocks.request
      .mockResolvedValueOnce(
        ok({
          workspaces: [
            { workspaceId: 's1', rootNodeId: 'r1', workspaceName: 'Product' },
            { workspaceId: 's2', rootNodeId: 'r2', name: 'Sales' },
            { workspaceId: 's3', rootNodeId: 'r3' }
          ]
        })
      )
      .mockResolvedValueOnce(
        ok({
          nodes: [doc, { nodeId: 'folder', name: 'Folder', type: 'folder' }, { nodeId: 'none' }]
        })
      );
    const api = provider();
    expect((await api.listFiles({ searchKey: 'Product' })).map(({ id }) => id)).toEqual(['r1']);
    expect(
      (await api.listFiles({ parentId: 'root', searchKey: 'Doc' })).map(({ id }) => id)
    ).toEqual(['doc']);
  });

  it.each([{}, { nodes: [] }])('空列表 %j 结束拉取', async (data) => {
    mocks.request.mockResolvedValueOnce(ok(data));
    await expect(provider({ rootNodeId: 'root' }).listFiles({})).resolves.toEqual([]);
  });

  it('运行时错误父 ID 转为空字符串时不请求目录', async () => {
    await expect(provider().listFiles({ parentId: [] as unknown as string })).resolves.toEqual([]);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it.each([
    { response: { status: 429 } },
    { data: { code: '429' } },
    { data: { errcode: 88 } },
    { data: { errorCode: 90018 } },
    { message: '请求频繁' }
  ])('识别限流形态 %#，等待一次后重试', async (error) => {
    vi.useFakeTimers();
    mocks.request.mockRejectedValueOnce(error).mockResolvedValueOnce(ok({ list: [doc] }));
    const result = provider({ rootNodeId: 'root' }).listFiles({});
    await vi.advanceTimersByTimeAsync(999);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual([expect.objectContaining({ id: 'doc', type: 'file' })]);
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ response: { status: 429 } }, rateLimitError],
    [new Error('network down'), nodePermissionError],
    ['specific failure', 'specific failure']
  ])('重试仍失败 %# 时停止，保留可读错误', async (retryError, expected) => {
    vi.useFakeTimers();
    mocks.request
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockRejectedValueOnce(retryError);
    const rejected = expect(provider({ rootNodeId: 'root' }).listFiles({})).rejects.toBe(expected);
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it.each([null, { data: { reason: 'denied' } }, { message: 'denied' }, { code: 'denied' }])(
    '非限流异常 %# 不重试',
    async (error) => {
      mocks.request.mockRejectedValueOnce(error);
      await expect(provider({ rootNodeId: 'root' }).listFiles({})).rejects.toBe(
        nodePermissionError
      );
      expect(mocks.request).toHaveBeenCalledTimes(1);
    }
  );
  it('知识库列表失败提供权限提示', async () => {
    mocks.request.mockRejectedValueOnce({ response: { data: { code: 'Forbidden' } } });
    await expect(provider().listFiles({})).rejects.toBe(
      '读取钉钉知识库列表失败，请检查 Wiki.Workspace.Read 权限'
    );
  });
});

describe('getDingtalkOperatorId（通过 listFiles 验证）', () => {
  it.each([{ unionid: 'fresh' }, { userid: 'fresh' }])(
    '每次使用当前用户的 operator ID，兼容 userid 回退 %j',
    async (result) => {
      mocks.post.mockImplementation(async (url: string) =>
        ok(
          url.includes('/oauth2/accessToken')
            ? { accessToken: 'token', expireIn: 7200 }
            : { result }
        )
      );
      mocks.request.mockResolvedValueOnce(ok({ workspaces: [] }));
      await provider({ operatorId: 'stale' }).listFiles({});
      expect(mocks.post).toHaveBeenCalledWith(
        expect.stringContaining('/topapi/v2/user/get'),
        { userid: 'user' },
        { params: { access_token: 'token' } }
      );
      expect(mocks.request.mock.calls[0][0].params.operatorId).toBe('fresh');
    }
  );
  it.each([
    [{ errcode: 500, errmsg: 'no permission' }, 'no permission'],
    [{ errcode: 500 }, 'DingTalk user get failed'],
    [{ errcode: 0, result: {} }, 'DingTalk operatorId is empty'],
    [{}, 'DingTalk operatorId is empty']
  ])('业务错误 %# 不请求知识库', async (data, expected) => {
    mocks.post.mockImplementation(async (url: string) =>
      ok(url.includes('/oauth2/accessToken') ? { accessToken: 'token', expireIn: 7200 } : data)
    );
    await expect(provider().listFiles({})).rejects.toBe(expected);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('用户 API 网络失败返回权限检查提示', async () => {
    mocks.post.mockImplementation(async (url: string) => {
      if (url.includes('/oauth2/accessToken')) return ok({ accessToken: 'token', expireIn: 7200 });
      throw new Error('network failure');
    });
    await expect(provider().listFiles({})).rejects.toBe(
      '获取钉钉用户 unionId 失败，请检查 UserId、通讯录可见范围和 qyapi_get_member 权限'
    );
  });
});

describe('getFileDetail', () => {
  it('已命名知识库根合成详情，不请求无法识别 workspace 的节点接口', async () => {
    expect(
      await provider({ rootNodeId: 'root', workspaceName: 'Space' }).getFileDetail({
        apiFileId: 'root'
      })
    ).toMatchObject({
      success: true,
      data: {
        id: 'root',
        rawId: 'root',
        parentId: null,
        name: 'Space',
        type: 'folder',
        hasChild: true
      }
    });
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each([{ rootNodeId: 'doc' }, { rootNodeId: 'root', workspaceName: 'Space' }])(
    '未命名根或非根节点查询真实详情 %j',
    async (config) => {
      mocks.request.mockResolvedValueOnce(ok({ node: doc }));
      expect(await provider(config).getFileDetail({ apiFileId: 'doc' })).toMatchObject({
        success: true,
        data: {
          id: 'doc',
          rawId: 'doc',
          parentId: 'root',
          name: 'Doc',
          type: 'file',
          hasChild: false
        }
      });
      expect(mocks.request.mock.calls[0][0]).toMatchObject({
        url: '/v2.0/wiki/nodes/doc',
        params: { operatorId: 'operator' }
      });
    }
  );
  it('不支持的节点 resolve NOT_FOUND', async () => {
    mocks.request.mockResolvedValueOnce(
      ok({ node: { nodeId: 'pdf', title: 'PDF', fileType: 'pdf' } })
    );
    expect(await provider().getFileDetail({ apiFileId: 'pdf' })).toEqual({
      success: false,
      code: 'NOT_FOUND',
      message: '文件不存在',
      status: 404
    });
  });
  it.each([
    [404, 'NOT_FOUND'],
    [503, 'SERVER_ERROR'],
    [429, 'RATE_LIMIT'],
    [403, 'UNAUTHORIZED']
  ])('HTTP %i resolve 对应错误 %s', async (status, code) => {
    mocks.request.mockRejectedValueOnce({ response: { status } });
    expect(await provider().getFileDetail({ apiFileId: 'doc' })).toMatchObject({
      success: false,
      code,
      status
    });
  });
});

describe('getFileContent', () => {
  it('递归读取嵌套文本，忽略元数据和空值，支持两种分页字段', async () => {
    mocks.request.mockImplementation(async ({ url, params }) => {
      if (!url.endsWith('/blocks')) return ok({ node: doc });
      if (params.nextToken === 'page2')
        return ok({ blocks: [{ plainText: ' page 2 ' }], nextPageToken: 'page3' });
      if (params.nextToken === 'page3') return ok({ blocks: [{ content: 'page 3' }] });
      return ok({
        blocks: [
          { paragraph: { elements: [{ text: ' hello ' }, { text: 'world' }] } },
          { text: ' ' },
          123,
          false,
          null,
          'ignored',
          { url: 'ignored' }
        ],
        nextToken: 'page2'
      });
    });
    await expect(provider().getFileContent({ apiFileId: 'doc' })).resolves.toEqual({
      title: 'Doc',
      rawText: 'hello\nworld\npage 2\npage 3'
    });
    expect(
      mocks.request.mock.calls
        .filter(([args]) => args.url.endsWith('/blocks'))
        .map(([args]) => args.params.nextToken)
    ).toEqual([undefined, 'page2', 'page3']);
  });
  it('标题查询失败不影响正文；空中间页仍继续分页', async () => {
    mocks.request.mockImplementation(async ({ url, params }) => {
      if (!url.endsWith('/blocks')) throw new Error('detail unavailable');
      return ok(
        params.nextToken
          ? { result: { data: [{ content: 'body' }] } }
          : { blocks: [], nextToken: 'next' }
      );
    });
    await expect(provider().getFileContent({ apiFileId: 'doc' })).resolves.toEqual({
      title: undefined,
      rawText: 'body'
    });
  });
  it('无有效文本时拒绝导入', async () => {
    mocks.request.mockResolvedValue(
      ok({ blocks: [{ text: ' ' }, { image: { url: 'https://example.com/a.png' } }] })
    );
    await expect(provider().getFileContent({ apiFileId: 'doc' })).rejects.toBe(
      '当前仅支持钉钉在线文档文本，不支持该文件类型'
    );
  });
  it.each([
    ['explicit failure', 'explicit failure'],
    [new Error('denied'), '读取钉钉在线文档失败，请检查文档类型和权限']
  ])('正文请求异常 %#', async (error, expected) => {
    mocks.request.mockRejectedValue(error);
    await expect(provider().getFileContent({ apiFileId: 'doc' })).rejects.toBe(expected);
  });
});

describe('getFilePreviewUrl', () => {
  it('直接生成节点预览链接', async () => {
    await expect(provider().getFilePreviewUrl({ apiFileId: 'doc' })).resolves.toBe(
      'https://alidocs.dingtalk.com/i/nodes/doc'
    );
    expect(mocks.request).not.toHaveBeenCalled();
  });
});

describe('getFileRawId', () => {
  it('保留原始 ID', () => expect(provider().getFileRawId('doc')).toBe('doc'));
});
