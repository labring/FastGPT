import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiDatasetMockServer } from './index';

describe('test/mockserver/dataset: ApiDatasetMockServer 参数化数据生成与服务测试', () => {
  const mockServer = new ApiDatasetMockServer();

  beforeAll(async () => {
    await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('通过参数生成小规模自定义树（例如 50 个文件）', async () => {
    const shape = { l1: 1, l2: 2, l3: 5, filesPerLeaf: 5 };
    const { folders, files } = mockServer.generateCustomTree(shape);

    expect(folders).toBe(1 + 2 + 10); // 13 个目录
    expect(files).toBe(50); // 50 个文件

    // 通过 HTTP 接口验证数据可用性
    const rootRes = await fetch(`${mockServer.baseUrl}/v1/file/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId: 'root' })
    }).then((r) => r.json());

    expect(rootRes.success).toBe(true);
    expect(rootRes.data).toHaveLength(1);
    expect(rootRes.data[0].id).toBe('l1-0');
  });

  it('通过参数生成中等规模自定义树（例如 600 个文件）', async () => {
    const shape = { l1: 2, l2: 3, l3: 5, filesPerLeaf: 20 };
    const { folders, files } = mockServer.generateCustomTree(shape);

    expect(folders).toBe(2 + 6 + 30); // 38 个目录
    expect(files).toBe(600); // 600 个文件
  });

  it('通过参数生成飞书自定义数据量（3 个目录，每个目录 15 个文档）', async () => {
    mockServer.generateFeishuData({ folderCount: 3, filesPerFolder: 15 });

    const filesRes = await fetch(
      `${mockServer.baseUrl}/open-apis/drive/v1/files?folder_token=fld-root`
    ).then((r) => r.json());
    expect(filesRes.code).toBe(0);
    expect(filesRes.data.files).toHaveLength(3);

    const folder1Files = await fetch(
      `${mockServer.baseUrl}/open-apis/drive/v1/files?folder_token=feishu-folder-0`
    ).then((r) => r.json());
    expect(folder1Files.data.files).toHaveLength(15);
  });

  it('通过参数生成钉钉自定义数据量（4 个知识库，每个 25 个节点，含 5 个带子节点的在线文档）', async () => {
    mockServer.generateDingtalkData({
      workspaceCount: 4,
      nodesPerWorkspace: 25,
      docsWithChildrenCount: 5
    });

    const wsRes = await fetch(`${mockServer.baseUrl}/v2.0/wiki/workspaces`).then((r) => r.json());
    expect(wsRes.workspaces).toHaveLength(4);

    const nodesRes = await fetch(
      `${mockServer.baseUrl}/v2.0/wiki/nodes?parentNodeId=root-ws-0`
    ).then((r) => r.json());
    expect(nodesRes.nodes).toHaveLength(25);
    expect(nodesRes.nodes.filter((n: any) => n.hasChildren)).toHaveLength(5);
  });

  it('通过参数生成语雀自定义数据量（10 个知识库，每个 30 篇文档）', async () => {
    mockServer.generateYuqueData({
      repoCount: 10,
      tocsPerRepo: 30
    });

    const reposRes = await fetch(`${mockServer.baseUrl}/api/v2/groups/user/repos`).then((r) =>
      r.json()
    );
    expect(reposRes.data).toHaveLength(10);

    const tocRes = await fetch(`${mockServer.baseUrl}/api/v2/repos/2000/toc`).then((r) => r.json());
    expect(tocRes.data).toHaveLength(30);
  });

  it('通过 HTTP POST /mock/configure 动态热更新数据量参数与模拟延迟', async () => {
    const configRes = await fetch(`${mockServer.baseUrl}/mock/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customTree: { l1: 1, l2: 1, l3: 2, filesPerLeaf: 10 },
        delayMs: 10
      })
    }).then((r) => r.json());

    expect(configRes.success).toBe(true);
    expect(mockServer.delayMs).toBe(10);

    // 验证重新配置生效：L1=1, L2=1, L3=2, filesPerLeaf=10 -> 20 个文件
    const t0 = Date.now();
    const rootRes = await fetch(`${mockServer.baseUrl}/v1/file/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId: 'root' })
    }).then((r) => r.json());
    const elapsed = Date.now() - t0;

    expect(rootRes.data).toHaveLength(1);
    expect(elapsed).toBeGreaterThanOrEqual(9); // 验证延迟注入生效

    // 清除延迟
    mockServer.delayMs = 0;
  });
});
