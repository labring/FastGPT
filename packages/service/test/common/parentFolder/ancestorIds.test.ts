import { describe, expect, it } from 'vitest';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import {
  getFolderAncestorIdsFromParentId,
  getFolderParentPathItems,
  rewriteFolderSubtreeAncestorIds
} from '@fastgpt/service/common/parentFolder/ancestorIds';

describe('getFolderAncestorIdsFromParentId', () => {
  it('rebuilds the path in root-to-parent order and handles root nodes', async () => {
    const folders = new Map([
      ['A', { _id: 'A', parentId: null }],
      ['B', { _id: 'B', parentId: 'A' }]
    ]);
    const findFolder = async (id: string) => folders.get(id) ?? null;

    await expect(getFolderAncestorIdsFromParentId({ parentId: 'B', findFolder })).resolves.toEqual([
      'A',
      'B'
    ]);
    await expect(getFolderAncestorIdsFromParentId({ parentId: null, findFolder })).resolves.toEqual(
      []
    );
  });

  it('rejects missing parents, cycles, and excessive path depth', async () => {
    await expect(
      getFolderAncestorIdsFromParentId({ parentId: 'missing', findFolder: async () => null })
    ).rejects.toBe(CommonErrEnum.invalidParams);
    const cycle = new Map([
      ['A', { _id: 'A', parentId: 'B' }],
      ['B', { _id: 'B', parentId: 'A' }]
    ]);
    await expect(
      getFolderAncestorIdsFromParentId({
        parentId: 'A',
        findFolder: async (id) => cycle.get(id) ?? null
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);
    await expect(
      getFolderAncestorIdsFromParentId({
        parentId: 'A',
        maxDepth: 1,
        findFolder: async (id) => ({ _id: id, parentId: id === 'A' ? 'B' : null })
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);
  });
});

describe('getFolderParentPathItems', () => {
  it('returns a display-only path and stops at a cycle', async () => {
    const folders = new Map([
      ['A', { _id: 'A', name: 'A', parentId: 'B' }],
      ['B', { _id: 'B', name: 'B', parentId: 'A' }]
    ]);
    await expect(
      getFolderParentPathItems({
        folderId: 'A',
        findFolder: async (id) => folders.get(id) ?? null
      })
    ).resolves.toEqual([
      { parentId: 'B', parentName: 'B' },
      { parentId: 'A', parentName: 'A' }
    ]);
  });
});

describe('rewriteFolderSubtreeAncestorIds', () => {
  it('rewrites every descendant from parentId links after moving to a new root', async () => {
    const children = new Map([
      ['moving', [{ _id: 'child', parentId: 'moving' }]],
      ['child', [{ _id: 'grandchild', parentId: 'child' }]],
      ['grandchild', []]
    ]);
    const writes: Array<{ id: string; ancestorIds: string[] }> = [];
    await rewriteFolderSubtreeAncestorIds({
      rootId: 'moving',
      rootAncestorIds: [],
      findChildFolders: async (parentIds) => parentIds.flatMap((id) => children.get(id) ?? []),
      writeAncestorIds: async (updates) => writes.push(...updates),
      maxDepth: 3
    });

    expect(writes).toEqual([
      { id: 'child', ancestorIds: ['moving'] },
      { id: 'grandchild', ancestorIds: ['moving', 'child'] }
    ]);
  });

  it('rejects cycles and descendants beyond the configured limit', async () => {
    const cycleWrites: Array<{ id: string; ancestorIds: string[] }> = [];
    await expect(
      rewriteFolderSubtreeAncestorIds({
        rootId: 'root',
        rootAncestorIds: [],
        findChildFolders: async () => [{ _id: 'root', parentId: 'child' }],
        writeAncestorIds: async (updates) => cycleWrites.push(...updates),
        maxDepth: 4
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);
    expect(cycleWrites).toEqual([]);

    await expect(
      rewriteFolderSubtreeAncestorIds({
        rootId: 'root',
        rootAncestorIds: [],
        findChildFolders: async (parentIds) =>
          parentIds.map((parentId) => ({ _id: `${parentId}-child`, parentId })),
        writeAncestorIds: async () => undefined,
        maxDepth: 1
      })
    ).rejects.toBe(CommonErrEnum.folderMoveDepthLimit);
  });
});
