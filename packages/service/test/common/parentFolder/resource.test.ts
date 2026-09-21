import { describe, expect, it } from 'vitest';
import { getFolderDescendantResourceIds } from '@fastgpt/service/common/parentFolder/resource';

type Node = {
  _id: string;
  parentId: string | null;
  type: 'folder' | 'resource';
};

describe('getFolderDescendantResourceIds', () => {
  it('queries each tree level once for all folders and returns each folder resource union', async () => {
    const nodes: Node[] = [
      { _id: 'a-child', parentId: 'folder-a', type: 'resource' },
      { _id: 'a-nested', parentId: 'folder-a', type: 'folder' },
      { _id: 'a-leaf', parentId: 'a-nested', type: 'resource' },
      { _id: 'b-child', parentId: 'folder-b', type: 'resource' }
    ];
    const calls: string[][] = [];

    const result = await getFolderDescendantResourceIds({
      folderIds: ['folder-a', 'folder-b'],
      fetchChildren: async (parentIds) => {
        calls.push(parentIds.sort());
        return nodes.filter((node) => node.parentId && parentIds.includes(node.parentId));
      },
      shouldTraverse: (node) => node.type === 'folder',
      isResource: (node) => node.type === 'resource'
    });

    expect(calls).toEqual([['folder-a', 'folder-b'], ['a-nested']]);
    expect(result.get('folder-a')?.sort()).toEqual(['a-child', 'a-leaf']);
    expect(result.get('folder-b')).toEqual(['b-child']);
  });

  it('keeps a nested folder visible as an independent page item without losing its parent union', async () => {
    const nodes: Node[] = [
      { _id: 'nested', parentId: 'parent', type: 'folder' },
      { _id: 'leaf', parentId: 'nested', type: 'resource' }
    ];

    const result = await getFolderDescendantResourceIds({
      folderIds: ['parent', 'nested'],
      fetchChildren: async (parentIds) =>
        nodes.filter((node) => node.parentId && parentIds.includes(node.parentId)),
      shouldTraverse: (node) => node.type === 'folder',
      isResource: (node) => node.type === 'resource'
    });

    expect(result.get('parent')).toEqual(['leaf']);
    expect(result.get('nested')).toEqual(['leaf']);
  });
});
