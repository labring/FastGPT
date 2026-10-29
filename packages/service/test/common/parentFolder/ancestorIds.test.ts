import { describe, expect, it } from 'vitest';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { serviceEnv } from '@fastgpt/service/env';
import {
  getFolderAncestorIdsFromParentId,
  getFolderParentPathItems,
  rewriteFolderSubtreeAncestorIds
} from '@fastgpt/service/common/parentFolder/ancestorIds';

describe('getFolderAncestorIdsFromParentId', () => {
  it('uses the configured write depth while display paths can read deeper history', async () => {
    const folders = new Map(
      Array.from(
        { length: serviceEnv.MAX_FOLDER_DEPTH + 1 },
        (_, i) =>
          [
            `level-${i + 1}`,
            { _id: `level-${i + 1}`, name: `level-${i + 1}`, parentId: i ? `level-${i}` : null }
          ] as const
      )
    );
    const findFolder = async (id: string) => folders.get(id) ?? null;
    const parentId = `level-${serviceEnv.MAX_FOLDER_DEPTH - 1}`;
    await expect(getFolderAncestorIdsFromParentId({ parentId, findFolder })).resolves.toHaveLength(
      serviceEnv.MAX_FOLDER_DEPTH - 1
    );
    await expect(
      getFolderAncestorIdsFromParentId({
        parentId: `level-${serviceEnv.MAX_FOLDER_DEPTH}`,
        findFolder
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);
    const paths = await getFolderParentPathItems({
      folderId: `level-${serviceEnv.MAX_FOLDER_DEPTH + 1}`,
      findFolder
    });
    expect(paths).toHaveLength(serviceEnv.MAX_FOLDER_DEPTH + 1);
  });

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
  it.each([2, 4])('counts target ancestors in the absolute depth limit %s', async (maxDepth) => {
    const rootAncestorIds = Array.from({ length: maxDepth - 2 }, (_, i) => `ancestor-${i}`);
    const children = new Map([
      ['moving', [{ _id: 'child', parentId: 'moving' }]],
      ['child', [] as Array<{ _id: string; parentId: string }>]
    ]);
    const writes: Array<{ id: string; ancestorIds: string[] }> = [];
    const props = {
      rootId: 'moving',
      rootAncestorIds,
      maxDepth,
      findChildFolders: async (ids: string[]) => ids.flatMap((id) => children.get(id) ?? []),
      writeAncestorIds: async (updates: typeof writes) => {
        writes.push(...updates);
      }
    };
    await expect(rewriteFolderSubtreeAncestorIds(props)).resolves.toBeUndefined();
    expect(writes).toEqual([{ id: 'child', ancestorIds: [...rootAncestorIds, 'moving'] }]);
    writes.length = 0;
    children.set('child', [{ _id: 'grandchild', parentId: 'child' }]);
    await expect(rewriteFolderSubtreeAncestorIds(props)).rejects.toBe(
      CommonErrEnum.folderMoveDepthLimit
    );
    expect(writes.map(({ id }) => id)).toEqual(['child']);
  });

  it('rejects an already over-depth root before querying or writing descendants', async () => {
    let reads = 0;
    let writes = 0;
    await expect(
      rewriteFolderSubtreeAncestorIds({
        rootId: 'moving',
        rootAncestorIds: Array.from({ length: serviceEnv.MAX_FOLDER_DEPTH }, (_, i) => String(i)),
        findChildFolders: async () => {
          reads++;
          return [];
        },
        writeAncestorIds: async () => {
          writes++;
        }
      })
    ).rejects.toBe(CommonErrEnum.folderMoveDepthLimit);
    expect(reads).toBe(0);
    expect(writes).toBe(0);
  });

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
