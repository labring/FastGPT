import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiDatasetMockServer } from './server';

let server: ApiDatasetMockServer;
beforeEach(() => {
  server = new ApiDatasetMockServer();
});
afterEach(async () => {
  await server.stop();
});

describe('generateCustomTree', () => {
  it.each([
    { l1: 0, l2: 2, l3: 5, filesPerLeaf: 5, folders: 0, files: 0 },
    { l1: 1, l2: 2, l3: 5, filesPerLeaf: 5, folders: 13, files: 50 },
    { l1: 2, l2: 3, l3: 5, filesPerLeaf: 20, folders: 38, files: 600 }
  ])('生成 $files 文件并清除前一份数据', ({ folders, files, ...shape }) => {
    expect(server.generateCustomTree(shape)).toEqual({ folders, files });
    const nodes = [...server.customFiles.values()].flat();
    expect(nodes.filter(({ type }) => type === 'folder')).toHaveLength(folders);
    expect(nodes.filter(({ type }) => type === 'file')).toHaveLength(files);
    expect(new Set(nodes.map(({ id }) => id)).size).toBe(folders + files);
    expect(nodes.some(({ id }) => id === 'doc-child')).toBe(false);
    for (const node of nodes) {
      if (node.parentId !== null) expect(server.customFiles.has(node.parentId)).toBe(true);
    }
  });
});

describe('generateFeishuData', () => {
  it('文档数量、目录关系和详情索引一致', () => {
    server.generateFeishuData({ folderCount: 3, filesPerFolder: 15 });
    expect(server.feishuFilesByFolder.get('fld-root')).toHaveLength(3);
    expect(server.feishuMetas.size).toBe(49);
    for (const folder of server.feishuFilesByFolder.get('fld-root')!) {
      const files = server.feishuFilesByFolder.get(folder.token)!;
      expect(files).toHaveLength(15);
      for (const file of files) {
        expect(file.parent_token).toBe(folder.token);
        expect(server.feishuMetas.get(file.token)).toEqual({ title: file.name, doc_type: 'docx' });
      }
    }
  });
});

describe('generateDingtalkData', () => {
  it('带子文档节点保留正文类型和真实子节点', () => {
    server.generateDingtalkData({
      workspaceCount: 4,
      nodesPerWorkspace: 25,
      docsWithChildrenCount: 5
    });
    expect(server.dingtalkWorkspaces).toHaveLength(4);
    for (const workspace of server.dingtalkWorkspaces) {
      const nodes = [...server.dingtalkNodes.values()].filter(
        ({ parentNodeId }) => parentNodeId === workspace.rootNodeId
      );
      expect(nodes).toHaveLength(25);
      const parents = nodes.filter(({ hasChildren }) => hasChildren);
      expect(parents).toHaveLength(5);
      for (const parent of parents) {
        expect(parent.docType).toBe('wiki_doc');
        expect(
          [...server.dingtalkNodes.values()].filter(
            ({ parentNodeId }) => parentNodeId === parent.nodeId
          )
        ).toHaveLength(1);
      }
    }
  });
});

describe('generateYuqueData', () => {
  it('按知识库隔离 TOC 和文档标识', () => {
    server.generateYuqueData({ repoCount: 10, tocsPerRepo: 30 });
    expect(server.yuqueRepos.size).toBe(10);
    const uuids = new Set<string>();
    for (const id of server.yuqueRepos.keys()) {
      const toc = server.yuqueTocs.get(String(id))!;
      expect(toc).toHaveLength(30);
      toc.forEach(({ uuid }) => uuids.add(uuid));
    }
    expect(uuids.size).toBe(300);
  });
});

describe('configure', () => {
  it('同一配置经构造器和热更新得到相同数据，并清理故障注入状态', () => {
    const options = {
      customTree: { l1: 1, l2: 1, l3: 2, filesPerLeaf: 10 },
      feishu: {},
      dingtalk: {},
      yuque: {},
      delayMs: 10
    };
    const configured = new ApiDatasetMockServer(options);
    server.feishu503 = true;
    server.feishu429 = true;
    server.feishuNotFoundTokens.add('missing');
    server.yuqueTocCalls = 5;
    server.configure(options);
    for (const key of [
      'customFiles',
      'feishuMetas',
      'feishuFilesByFolder',
      'dingtalkNodes',
      'dingtalkWorkspaces',
      'yuqueRepos',
      'yuqueTocs'
    ] as const) {
      expect(server[key]).toEqual(configured[key]);
    }
    expect(server.delayMs).toBe(10);
    expect(server.feishu503).toBe(false);
    expect(server.feishu429).toBe(false);
    expect(server.feishuNotFoundTokens.size).toBe(0);
    expect(server.yuqueTocCalls).toBe(0);
  });
});

describe('start / handleRequest / stop', () => {
  // 这里只验证模拟服务本身的 HTTP 路由；provider 数据转换在各自 api.test.ts 中验证。
  it.each([
    [
      '/v1/file/list',
      'POST',
      { parentId: 'fld-1' },
      200,
      { success: true, data: [{ id: 'doc-child' }] }
    ],
    [
      '/v1/file/detail?id=doc-child',
      'GET',
      undefined,
      200,
      { success: true, data: { id: 'doc-child' } }
    ],
    ['/v1/file/detail?id=missing', 'GET', undefined, 200, { success: false }],
    [
      '/open-apis/drive/v1/files?folder_token=fld-root',
      'GET',
      undefined,
      200,
      { code: 0, data: { files: [{ token: 'doc-1' }] } }
    ],
    ['/v2.0/wiki/nodes/sub-doc', 'GET', undefined, 200, { node: { nodeId: 'sub-doc' } }],
    ['/v2.0/wiki/nodes/missing', 'GET', undefined, 404, { code: 404 }],
    [
      '/api/v2/repos/1001/toc',
      'GET',
      undefined,
      200,
      { data: [{ uuid: 'u-fld1' }, { uuid: 'u-doc1' }] }
    ],
    ['/unknown', 'GET', undefined, 404, { message: 'Not found' }]
  ])('%s 返回协议状态与数据', async (path, method, body, status, data) => {
    await server.start();
    const response = await fetch(`${server.baseUrl}${path}`, {
      method,
      body: body ? JSON.stringify(body) : undefined
    });
    expect(response.status).toBe(status);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject(data);
    expect(server.requestCount).toBe(1);
  });

  it('HTTP 热更新生效，重复 stop 可安全调用', async () => {
    await server.start();
    const response = await fetch(`${server.baseUrl}/mock/configure`, {
      method: 'POST',
      body: JSON.stringify({ customTree: { l1: 1, l2: 1, l3: 2, filesPerLeaf: 10 }, delayMs: 1 })
    });
    expect(await response.json()).toMatchObject({ success: true });
    expect(server.delayMs).toBe(1);
    const list = await fetch(`${server.baseUrl}/v1/file/list`, {
      method: 'POST',
      body: '{invalid'
    });
    expect(await list.json()).toMatchObject({ success: true, data: [{ id: 'l1-0' }] });
    await server.stop();
    await server.stop();
  });
});
