import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import type { APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { buildApiFileTree, type ApiFileTreeNode } from '../../../../core/dataset/apiDataset/tree';

/** 造一个 listFiles 返回的 server 节点；name 刻意与 id 不同，用于断言 name 被原样透传 */
const file = (id: string, type: 'file' | 'folder', hasChild = false): APIFileItemType => ({
  id,
  rawId: id,
  parentId: '',
  name: `name-${id}`,
  type,
  hasChild,
  updateTime: new Date(),
  createTime: new Date()
});

/** 4 层树：l1(folder) > l2(folder) > l3(folder) > l4(file) */
const mockFourLevelTree = (listFiles: ReturnType<typeof vi.fn>) => {
  listFiles.mockImplementation(async ({ parentId }: { parentId: string }) => {
    if (parentId === 'l1') return [file('l2', 'folder', true)];
    if (parentId === 'l2') return [file('l3', 'folder', true)];
    if (parentId === 'l3') return [file('l4', 'file')];
    return [];
  });
};

describe('buildApiFileTree', () => {
  const listFiles = vi.fn();
  const request = { listFiles } as any;

  beforeEach(() => {
    listFiles.mockReset();
  });

  /**
   * 被测函数名: buildApiFileTree  等级: 3-High
   * 思路（正常场景）: 4 层树 l1>l2>l3>l4(file)，父先子后返回，name / depth / serverParentId 逐层正确
   */
  it('T1-1: 4 层树父先子后返回，depth 与 serverParentId 逐层正确', async () => {
    mockFourLevelTree(listFiles);

    const nodes = await buildApiFileTree({ request, seeds: [file('l1', 'folder', true)] });

    expect(
      nodes.map((node) => [node.serverId, node.name, node.type, node.depth, node.serverParentId])
    ).toEqual([
      ['l1', 'name-l1', 'folder', 0, null],
      ['l2', 'name-l2', 'folder', 1, 'l1'],
      ['l3', 'name-l3', 'folder', 2, 'l2'],
      ['l4', 'name-l4', 'file', 3, 'l3']
    ]);
    expect(listFiles.mock.calls.map((call) => call[0])).toEqual([
      { parentId: 'l1' },
      { parentId: 'l2' },
      { parentId: 'l3' }
    ]);
  });

  /**
   * 被测函数名: buildApiFileTree  等级: 3-High
   * 思路（回归场景）: 同 4 层树，folder 节点必须与 file 一并保留
   */
  it('T1-2: 4 层树中的 folder 节点一并保留', async () => {
    mockFourLevelTree(listFiles);

    const nodes = await buildApiFileTree({ request, seeds: [file('l1', 'folder', true)] });

    expect(nodes.filter((node) => node.type === 'folder')).toHaveLength(3);
    expect(nodes.filter((node) => node.type === 'file')).toHaveLength(1);
  });

  /**
   * 被测函数名: buildApiFileTree  等级: 3-High
   * 思路（正常场景）: 知识库根哨兵的 id 不是真实 server 节点，展开子级要用 seed.listId
   */
  it('T1-3: seed.listId 覆盖 listFiles 的 parentId', async () => {
    listFiles.mockResolvedValue([]);

    const nodes = await buildApiFileTree({
      request,
      seeds: [{ ...file(RootCollectionId, 'folder', true), listId: 'base-path' }]
    });

    expect(listFiles).toHaveBeenCalledTimes(1);
    expect(listFiles).toHaveBeenCalledWith({ parentId: 'base-path' });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      serverId: RootCollectionId,
      type: 'folder',
      name: `name-${RootCollectionId}`,
      depth: 0,
      serverParentId: null
    });
  });

  it('T1-3b: 显式 undefined 的 seed.listId 枚举 provider 根，不回退到 SYSTEM_ROOT', async () => {
    listFiles.mockResolvedValue([]);

    await buildApiFileTree({
      request,
      seeds: [{ ...file(RootCollectionId, 'folder', true), listId: undefined }]
    });

    expect(listFiles).toHaveBeenCalledWith({ parentId: undefined });
  });

  /**
   * 被测函数名: buildApiFileTree  等级: 3-High
   * 思路（边界场景）: hasChild 为 false 的 folder 只产出节点，不发起 listFiles（ET-003）
   */
  it('T1-4: hasChild 为 false 的 folder 不递归拉取子级', async () => {
    const nodes = await buildApiFileTree({
      request,
      seeds: [file('empty-folder', 'folder', false)]
    });

    expect(listFiles).not.toHaveBeenCalled();
    expect(nodes).toEqual([
      {
        serverId: 'empty-folder',
        serverParentId: null,
        type: 'folder',
        name: 'name-empty-folder',
        depth: 0,
        hasChild: false
      }
    ]);
  });

  /**
   * 被测函数名: buildApiFileTree  等级: 3-High
   * 思路（正常场景）: 单 file seed 产出 1 个根节点，且不发起 listFiles（TC-004）
   */
  it('T1-5: 单 file seed 产出 1 个根节点且不拉取子级', async () => {
    const nodes = await buildApiFileTree({ request, seeds: [file('f1', 'file', false)] });

    expect(listFiles).not.toHaveBeenCalled();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      serverId: 'f1',
      type: 'file',
      depth: 0,
      serverParentId: null,
      hasChild: false
    });
  });

  /**
   * 被测函数名: buildApiFileTree  等级: 3-High
   * 思路（边界场景）: seeds 为空时返回空数组，且不发起任何 listFiles（ET-010）
   */
  it('T1-6: seeds 为空返回空数组且不调用 listFiles', async () => {
    const nodes = await buildApiFileTree({ request, seeds: [] });

    expect(nodes).toEqual([]);
    expect(listFiles).not.toHaveBeenCalled();
  });

  /**
   * 被测函数名: buildApiFileTree  等级: 3-High
   * 思路（边界场景）: 两个同 id 的 seed 只产出一个节点，visited 同时抵御重复/自引用死循环
   */
  it('T1-7: 重复 id 的 seed 只产出一个节点', async () => {
    listFiles.mockResolvedValue([]);

    const nodes = await buildApiFileTree({
      request,
      seeds: [file('dup', 'folder', true), file('dup', 'folder', true)]
    });

    expect(nodes).toHaveLength(1);
    expect(listFiles).toHaveBeenCalledTimes(1);
  });

  it('T1-7b: 子目录先于祖先传入时，以祖先遍历出的层级覆盖根级占位', async () => {
    listFiles.mockImplementation(async ({ parentId }: { parentId: string }) => {
      if (parentId === 'a') return [file('b', 'folder', true)];
      if (parentId === 'b') return [file('c', 'file')];
      return [];
    });

    const nodes = await buildApiFileTree({
      request,
      seeds: [file('b', 'folder', true), file('a', 'folder', true)]
    });

    expect(
      nodes.map(({ serverId, serverParentId, depth }) => [serverId, serverParentId, depth])
    ).toEqual([
      ['a', null, 0],
      ['b', 'a', 1],
      ['c', 'b', 2]
    ]);
    expect(listFiles.mock.calls.map((call) => call[0])).toEqual([
      { parentId: 'b' },
      { parentId: 'a' }
    ]);
  });

  it('T1-7c: provider 返回祖先回环时不改写为循环层级', async () => {
    listFiles.mockImplementation(async ({ parentId }: { parentId: string }) => {
      if (parentId === 'a') return [file('b', 'folder', true)];
      if (parentId === 'b') return [file('a', 'folder', true)];
      return [];
    });

    const nodes = await buildApiFileTree({ request, seeds: [file('a', 'folder', true)] });

    expect(
      nodes.map(({ serverId, serverParentId, depth }) => [serverId, serverParentId, depth])
    ).toEqual([
      ['a', null, 0],
      ['b', 'a', 1]
    ]);
    expect(listFiles).toHaveBeenCalledTimes(2);
  });

  /**
   * 被测函数名: buildApiFileTree  等级: 3-High
   * 思路（异常场景）: listFiles reject 时异常直接上抛，不吞异常（ET-004）
   */
  it('T1-8: listFiles reject 时异常上抛', async () => {
    listFiles.mockRejectedValue(new Error('list files failed'));

    await expect(
      buildApiFileTree({ request, seeds: [file('l1', 'folder', true)] })
    ).rejects.toThrow('list files failed');
  });
});

/**
 * INT-3：同一份 mock server 树分别喂给创建路径的 seeds 与同步路径的 seeds，断言两条路径
 * 对每个节点的本地父级解析结果一致。
 *
 * 两条路径的差异只有两处：
 *  1. seed 构造：创建路径在「全选」时只提交根哨兵（listId = basePath），展开后 server 根级节点
 *     的 serverParentId 是 RootCollectionId；同步路径在本地存在哨兵行时（isRoot）直接列举
 *     server 根，serverParentId 是 null。
 *  2. 父级解析：本地父级由各自内联的规则得出。
 * 遍历本身（buildApiFileTree）是两边共用的真实实现。
 *
 * 注意：解析规则在生产代码里是各自内联的闭包（apiCollectionV2.ts 的 resolveParentId /
 * sync.ts 的 resolveCreateParentId），本文件只是把规则逐行照抄成语义等价物，因此这里通过只能
 * 证明「规则应当如此」，不能证明生产实现没漂移。绑定生产实现的回归证据是 INT-4
 * （test/integrationTest/apiFileHierarchy/，两条真实路径跑在同一份内存 Mongo 上）。
 */
describe('INT-3 创建路径与同步路径的层级对齐（纯函数）', () => {
  const listFiles = vi.fn();
  const request = { listFiles } as any;

  /** 本地已有行的 _id；用可读串代替真实 ObjectId，等值比较与本测试目的无关 */
  const SENTINEL_ROW_ID = 'sentinel-row-id';
  const localRows = new Map<string, string>([
    [RootCollectionId, SENTINEL_ROW_ID],
    ['a', 'row-a'],
    ['a1', 'row-a1']
  ]);

  /** server 根级节点 a(folder) / f0(file)，a 下有 a1(folder) / af(file)，a1 下有 a1f(file) */
  const mockWholeKbTree = () => {
    listFiles.mockImplementation(async ({ parentId }: { parentId: string | null }) => {
      if (parentId === 'ROOT' || parentId === null)
        return [file('a', 'folder', true), file('f0', 'file')];
      if (parentId === 'a') return [file('a1', 'folder', true), file('af', 'file')];
      if (parentId === 'a1') return [file('a1f', 'file')];
      return [];
    });
  };

  const buildCreateNodes = () =>
    buildApiFileTree({
      request,
      // 创建路径：用户在导入弹窗选择「全选」→ 只提交根哨兵，展开子级走 basePath
      seeds: [{ ...file(RootCollectionId, 'folder', true), listId: 'ROOT' }]
    });

  const buildSyncNodes = async () => {
    // 同步路径：本地存在哨兵行 → isRoot，直接列举 server 根
    const seeds = (await request.listFiles({ parentId: null })) as APIFileItemType[];
    return buildApiFileTree({ request, seeds });
  };

  beforeEach(() => {
    listFiles.mockReset();
    mockWholeKbTree();
  });

  it('INT-3: 两条路径的节点三元组一致（创建路径剔除哨兵、depth 归零后）', async () => {
    const createNodes = await buildCreateNodes();
    const syncNodes = await buildSyncNodes();

    const sentinel = createNodes.find((node) => node.serverId === RootCollectionId)!;
    expect(sentinel).toBeTruthy();

    const createTriples = createNodes
      .filter((node) => node.serverId !== RootCollectionId)
      .map((node) => [
        node.serverId,
        // 规范化：创建路径里 server 根级节点的父级是哨兵，语义上就是 server 根
        node.serverParentId === RootCollectionId ? null : node.serverParentId,
        node.depth - (sentinel.depth + 1)
      ])
      .sort();
    const syncTriples = syncNodes
      .map((node) => [node.serverId, node.serverParentId, node.depth])
      .sort();

    expect(createTriples).toEqual(syncTriples);
  });

  it('INT-3-b: 逐个节点解析本地父级，两条路径必须落到同一行', async () => {
    const createNodes = await buildCreateNodes();
    const syncNodes = await buildSyncNodes();

    /** 创建路径：节点已有本地父级时直接查表；本次选中的最外层节点（serverParentId === null）用请求体父级 */
    const createLocalParentOf = (node: ApiFileTreeNode) =>
      node.serverParentId === null ? undefined : localRows.get(node.serverParentId);
    /** 同步路径：全量导入（哨兵 scope）下 server 根级节点的本地父级是哨兵行，而不是 dataset 根 */
    const syncLocalParentOf = (node: ApiFileTreeNode) =>
      node.serverParentId === null ? SENTINEL_ROW_ID : localRows.get(node.serverParentId);

    const createParents = new Map(
      createNodes
        .filter((node) => node.serverId !== RootCollectionId)
        .map((node) => [node.serverId, createLocalParentOf(node)])
    );
    const syncParents = new Map(syncNodes.map((node) => [node.serverId, syncLocalParentOf(node)]));

    for (const [serverId, createParent] of createParents) {
      expect(syncParents.get(serverId), `${serverId} 的本地父级`).toBe(createParent);
    }
  });
});
