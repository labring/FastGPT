import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import type { APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { buildApiFileTree } from '../../../../core/dataset/apiDataset/tree';

/** 造一个 listFiles 返回的 server 节点；rawId 与 id 一致即可，遍历只用 id */
const file = (id: string, type: 'file' | 'folder', hasChild = false): APIFileItemType => ({
  id,
  rawId: id,
  parentId: '',
  name: id,
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
   * 思路（正常场景）: 4 层树 l1>l2>l3>l4(file)，父先子后返回且 depth / serverParentId 逐层正确
   */
  it('T1-1: 4 层树父先子后返回，depth 与 serverParentId 逐层正确', async () => {
    mockFourLevelTree(listFiles);

    const nodes = await buildApiFileTree({ request, seeds: [file('l1', 'folder', true)] });

    expect(
      nodes.map((node) => [node.serverId, node.type, node.depth, node.serverParentId])
    ).toEqual([
      ['l1', 'folder', 0, null],
      ['l2', 'folder', 1, 'l1'],
      ['l3', 'folder', 2, 'l2'],
      ['l4', 'file', 3, 'l3']
    ]);
    expect(listFiles.mock.calls.map((call) => call[0])).toEqual([
      { parentId: 'l1' },
      { parentId: 'l2' },
      { parentId: 'l3' }
    ]);
  });

  /**
   * 被测函数名: buildApiFileTree  等级: 3-High
   * 思路（回归场景）: 同 4 层树，folder 必须一并保留（旧实现只 push file，folder 数为 0）
   */
  it('T1-2: 遍历结果保留 folder 节点（D3 修复，旧实现为 0）', async () => {
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
      name: RootCollectionId,
      depth: 0,
      serverParentId: null
    });
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
        name: 'empty-folder',
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
