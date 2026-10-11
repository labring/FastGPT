import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import {
  buildApiFileRecords,
  buildApiFileTree,
  type ApiFileTreeNode,
  toApiFileDirId,
  type ApiFileTreeSeed
} from '@fastgpt/service/core/dataset/apiDataset/tree';
import { ApiDatasetMockServer } from '@test/mockserver/dataset/server';

/** 造一个 listFiles 返回的 server 节点；name 刻意与 id 不同，用于断言 name 被原样透传 */
const file = (id: string, type: 'file' | 'folder', hasChild = false): ApiFileTreeSeed => ({
  id,
  name: `name-${id}`,
  type,
  hasChild
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
  // 遍历仅使用 listFiles；其余 provider 方法不参与本测试。
  const request = { listFiles } as unknown as Parameters<typeof buildApiFileTree>[0]['request'];

  beforeEach(() => {
    listFiles.mockReset();
  });

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
        dirId: 'empty-folder',
        type: 'folder',
        name: 'name-empty-folder',
        depth: 0,
        hasChild: false
      }
    ]);
  });

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

  it('T1-6: seeds 为空返回空数组且不调用 listFiles', async () => {
    const nodes = await buildApiFileTree({ request, seeds: [] });

    expect(nodes).toEqual([]);
    expect(listFiles).not.toHaveBeenCalled();
  });

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
      if (parentId === 'other') return [file('other-file', 'file')];
      if (parentId === 'a') return [file('b', 'folder', true)];
      if (parentId === 'b') return [file('c', 'folder', true), file('sibling', 'file')];
      if (parentId === 'c') return [file('d', 'file')];
      return [];
    });

    const nodes = await buildApiFileTree({
      request,
      seeds: [file('other', 'folder', true), file('b', 'folder', true), file('a', 'folder', true)]
    });

    expect(
      nodes.map(({ serverId, serverParentId, depth }) => [serverId, serverParentId, depth])
    ).toEqual([
      ['other', null, 0],
      ['a', null, 0],
      ['other-file', 'other', 1],
      ['b', 'a', 1],
      ['c', 'b', 2],
      ['sibling', 'b', 2],
      ['d', 'c', 3]
    ]);
    expect(listFiles.mock.calls.map((call) => call[0])).toEqual([
      { parentId: 'other' },
      { parentId: 'b' },
      { parentId: 'c' },
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

  it('T1-8: listFiles reject 时异常上抛', async () => {
    listFiles.mockRejectedValue(new Error('list files failed'));

    await expect(
      buildApiFileTree({ request, seeds: [file('l1', 'folder', true)] })
    ).rejects.toThrow('list files failed');
  });
  it('4 万文件无遗漏、无重复，所有父目录都先于子记录生成', async () => {
    const server = new ApiDatasetMockServer({
      customTree: { l1: 4, l2: 10, l3: 10, filesPerLeaf: 100 }
    });
    listFiles.mockImplementation(async ({ parentId }) => server.customFiles.get(parentId) ?? []);
    const nodes = await buildApiFileTree({ request, seeds: [file('root', 'folder', true)] });
    const records = buildApiFileRecords(nodes);
    expect(listFiles).toHaveBeenCalledTimes(445);
    expect(records).toHaveLength(40445);
    expect(records.filter(({ type }) => type === 'file')).toHaveLength(40000);
    expect(new Set(records.map(({ apiFileId }) => apiFileId)).size).toBe(records.length);
    const directories = new Set<string>();
    for (const record of records) {
      if (record.parentDirId !== null) expect(directories.has(record.parentDirId)).toBe(true);
      if (record.type === 'folder') directories.add(record.apiFileId);
    }
  });
});

describe('buildApiFileRecords', () => {
  const node = (overrides: Partial<ApiFileTreeNode> = {}): ApiFileTreeNode => ({
    serverId: 'dir',
    serverParentId: null,
    dirId: 'dir',
    type: 'folder',
    name: 'Directory',
    depth: 0,
    hasChild: true,
    ...overrides
  });

  it('folder / 带子文档的 file / 普通 file 产出各自的记录', () => {
    const records = buildApiFileRecords([
      node(),
      node({ serverId: 'doc', dirId: 'doc#dir', type: 'file', serverParentId: 'dir', depth: 1 }),
      node({
        serverId: 'plain',
        dirId: 'plain#dir',
        type: 'file',
        hasChild: false,
        serverParentId: 'dir',
        depth: 1
      }),
      node({
        serverId: 'child',
        dirId: 'child#dir',
        type: 'file',
        hasChild: false,
        serverParentId: 'doc',
        depth: 2
      })
    ]);

    expect(
      records.map((record) => [
        record.apiFileId,
        record.apiFileParentId,
        record.parentDirId,
        record.type,
        record.depth
      ])
    ).toEqual([
      ['dir', null, null, 'folder', 0],
      ['doc#dir', 'dir', 'dir', 'folder', 1],
      ['doc', 'dir', 'doc#dir', 'file', 1],
      ['plain', 'dir', 'dir', 'file', 1],
      ['child', 'doc', 'doc#dir', 'file', 2]
    ]);
  });

  it('派生目录 id 与 provider id 冲突时拒绝生成记录', () => {
    expect(() =>
      buildApiFileRecords([
        node({ serverId: 'doc', dirId: 'doc#dir', type: 'file' }),
        node({ serverId: 'doc#dir', dirId: 'doc#dir', hasChild: false })
      ])
    ).toThrow('Api file directory id conflicts with provider id: doc#dir');
  });

  it('空输入不生成记录，缺失父节点回退到根目录', () => {
    expect(buildApiFileRecords([])).toEqual([]);
    expect(buildApiFileRecords([node({ serverParentId: 'missing', hasChild: false })])).toEqual([
      {
        apiFileId: 'dir',
        apiFileParentId: 'missing',
        parentDirId: null,
        type: 'folder',
        name: 'Directory',
        depth: 0
      }
    ]);
  });
});

describe('toApiFileDirId', () => {
  it.each(['folder', 'file'] as const)('%s 保持旧数据目录 ID 约定', (type) => {
    expect(toApiFileDirId('doc', type)).toBe(type === 'folder' ? 'doc' : 'doc#dir');
  });
});
