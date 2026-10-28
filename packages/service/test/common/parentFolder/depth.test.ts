import { serviceEnv } from '@fastgpt/service/env';
import { defaultSubtreeMaxDepth } from '@fastgpt/global/common/parentFolder/subtree';
import { describe, expect, it } from 'vitest';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import {
  checkCreateFolderDepth,
  checkCreateResourceParent,
  checkMoveFolderDepth
} from '@fastgpt/service/common/parentFolder/depth';

type TestFolderDoc = {
  _id: string;
  parentId?: string | null;
  teamId: string;
  type: 'folder' | 'file';
};

const teamId = 'team-1';
const folderType = (type: string) => type === 'folder';

/** 用内存数据注入单参数查询，不模拟数据库 Model 或链式查询。 */
const createQueries = (docs: TestFolderDoc[]) => {
  const scopedDocs = docs.filter((doc) => doc.teamId === teamId);
  const docMap = new Map(scopedDocs.map((doc) => [doc._id, doc]));
  const findResourceCalls: string[] = [];
  const findChildrenCalls: string[] = [];

  return {
    queries: {
      findResource: async (id: string) => {
        findResourceCalls.push(id);
        return docMap.get(id) ?? null;
      },
      findChildren: async (parentId: string) => {
        findChildrenCalls.push(parentId);
        return scopedDocs.filter((doc) => doc.parentId === parentId);
      }
    },
    findResourceCalls,
    findChildrenCalls
  };
};

describe('folder depth checks', () => {
  it('allows creating a root folder without querying parent chain', async () => {
    const { queries, findResourceCalls } = createQueries([]);

    await expect(
      checkCreateFolderDepth({ parentId: null, ...queries, isFolderType: folderType })
    ).resolves.toBe(undefined);
    expect(findResourceCalls).toEqual([]);
  });

  it('allows creating the fourth level folder with default max depth', async () => {
    const { queries } = createQueries([
      { _id: 'level-1', parentId: null, teamId, type: 'folder' },
      { _id: 'level-2', parentId: 'level-1', teamId, type: 'folder' },
      { _id: 'level-3', parentId: 'level-2', teamId, type: 'folder' }
    ]);

    await expect(
      checkCreateFolderDepth({ parentId: 'level-3', ...queries, isFolderType: folderType })
    ).resolves.toBe(undefined);
  });

  it('rejects creating beyond the default max depth without scanning remaining ancestors', async () => {
    const { queries, findResourceCalls } = createQueries([
      { _id: 'level-1', parentId: null, teamId, type: 'folder' },
      { _id: 'level-2', parentId: 'level-1', teamId, type: 'folder' },
      { _id: 'level-3', parentId: 'level-2', teamId, type: 'folder' },
      { _id: 'level-4', parentId: 'level-3', teamId, type: 'folder' }
    ]);

    await expect(
      checkCreateFolderDepth({ parentId: 'level-4', ...queries, isFolderType: folderType })
    ).rejects.toBe(CommonErrEnum.folderDepthLimit);
    expect(findResourceCalls).toEqual(['level-4', 'level-3', 'level-2', 'level-1']);
  });

  it('allows moving a folder subtree to root when the subtree depth reaches the max depth exactly', async () => {
    const { queries } = createQueries([
      { _id: 'moving-1', parentId: null, teamId, type: 'folder' },
      { _id: 'moving-2', parentId: 'moving-1', teamId, type: 'folder' },
      { _id: 'moving-3', parentId: 'moving-2', teamId, type: 'folder' },
      { _id: 'moving-4', parentId: 'moving-3', teamId, type: 'folder' }
    ]);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-1',
        targetParentId: null,
        ...queries,
        isFolderType: folderType
      })
    ).resolves.toBe(undefined);
  });

  it('allows moving a folder subtree when target depth plus subtree depth reaches the max depth exactly', async () => {
    const { queries } = createQueries([
      { _id: 'level-1', parentId: null, teamId, type: 'folder' },
      { _id: 'level-2', parentId: 'level-1', teamId, type: 'folder' },
      { _id: 'moving-1', parentId: null, teamId, type: 'folder' },
      { _id: 'moving-2', parentId: 'moving-1', teamId, type: 'folder' }
    ]);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-1',
        targetParentId: 'level-2',
        ...queries,
        isFolderType: folderType
      })
    ).resolves.toBe(undefined);
  });

  it('allows moving a non-folder resource into the deepest allowed folder', async () => {
    const { queries } = createQueries([
      { _id: 'level-1', parentId: null, teamId, type: 'folder' },
      { _id: 'level-2', parentId: 'level-1', teamId, type: 'folder' },
      { _id: 'level-3', parentId: 'level-2', teamId, type: 'folder' },
      { _id: 'level-4', parentId: 'level-3', teamId, type: 'folder' },
      { _id: 'file-1', parentId: null, teamId, type: 'file' }
    ]);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'file-1',
        targetParentId: 'level-4',
        ...queries,
        isFolderType: folderType
      })
    ).resolves.toBe(undefined);
  });

  it('rejects moving a folder into the deepest allowed folder', async () => {
    const { queries } = createQueries([
      { _id: 'level-1', parentId: null, teamId, type: 'folder' },
      { _id: 'level-2', parentId: 'level-1', teamId, type: 'folder' },
      { _id: 'level-3', parentId: 'level-2', teamId, type: 'folder' },
      { _id: 'level-4', parentId: 'level-3', teamId, type: 'folder' },
      { _id: 'moving-folder', parentId: null, teamId, type: 'folder' }
    ]);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-folder',
        targetParentId: 'level-4',
        ...queries,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.folderMoveDepthLimit);
  });

  it('rejects moving into a target parent chain beyond max depth before scanning subtree', async () => {
    const { queries, findResourceCalls, findChildrenCalls } = createQueries([
      { _id: 'level-1', parentId: null, teamId, type: 'folder' },
      { _id: 'level-2', parentId: 'level-1', teamId, type: 'folder' },
      { _id: 'level-3', parentId: 'level-2', teamId, type: 'folder' },
      { _id: 'level-4', parentId: 'level-3', teamId, type: 'folder' },
      { _id: 'level-5', parentId: 'level-4', teamId, type: 'folder' },
      { _id: 'moving-folder', parentId: null, teamId, type: 'folder' }
    ]);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-folder',
        targetParentId: 'level-5',
        ...queries,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.folderMoveDepthLimit);
    expect(findResourceCalls).toEqual(['level-5', 'level-4', 'level-3', 'level-2', 'level-1']);
    expect(findChildrenCalls).toEqual([]);
  });

  it('rejects moving a deep folder subtree once it exceeds remaining target depth', async () => {
    const { queries, findChildrenCalls } = createQueries([
      { _id: 'target', parentId: null, teamId, type: 'folder' },
      { _id: 'moving-1', parentId: null, teamId, type: 'folder' },
      { _id: 'moving-2', parentId: 'moving-1', teamId, type: 'folder' },
      { _id: 'moving-3', parentId: 'moving-2', teamId, type: 'folder' },
      { _id: 'moving-4', parentId: 'moving-3', teamId, type: 'folder' }
    ]);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-1',
        targetParentId: 'target',
        ...queries,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.folderMoveDepthLimit);
    expect(findChildrenCalls).toEqual(['moving-1', 'moving-2', 'moving-3']);
  });

  it('rejects moving a folder to itself or one of its descendants', async () => {
    const { queries } = createQueries([
      { _id: 'moving-folder', parentId: null, teamId, type: 'folder' },
      { _id: 'child-folder', parentId: 'moving-folder', teamId, type: 'folder' }
    ]);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-folder',
        targetParentId: 'moving-folder',
        ...queries,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-folder',
        targetParentId: 'child-folder',
        ...queries,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);
  });

  it('rejects invalid parent chains and missing moved resources', async () => {
    const { queries } = createQueries([
      { _id: 'foreign-parent', parentId: null, teamId: 'team-2', type: 'folder' }
    ]);

    await expect(
      checkCreateFolderDepth({
        parentId: 'missing-parent',
        ...queries,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);
    await expect(
      checkCreateFolderDepth({
        parentId: 'foreign-parent',
        ...queries,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);
    await expect(
      checkMoveFolderDepth({
        resourceId: 'missing-resource',
        targetParentId: null,
        ...queries,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.invalidResource);
  });

  it('rejects invalid target parents while moving resources', async () => {
    const { queries } = createQueries([
      { _id: 'foreign-parent', parentId: null, teamId: 'team-2', type: 'folder' },
      { _id: 'moving-folder', parentId: null, teamId, type: 'folder' }
    ]);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-folder',
        targetParentId: 'missing-parent',
        ...queries,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-folder',
        targetParentId: 'foreign-parent',
        ...queries,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);
  });

  it('rejects cyclic parent chains', async () => {
    const { queries } = createQueries([
      { _id: 'cycle-a', parentId: 'cycle-b', teamId, type: 'folder' },
      { _id: 'cycle-b', parentId: 'cycle-a', teamId, type: 'folder' }
    ]);

    await expect(
      checkCreateFolderDepth({ parentId: 'cycle-a', ...queries, isFolderType: folderType })
    ).rejects.toBe(CommonErrEnum.invalidParams);
  });
});

describe('checkCreateResourceParent', () => {
  it('accepts a business-specific depth limit without changing the default creation policy', async () => {
    const { queries } = createQueries(
      Array.from({ length: defaultSubtreeMaxDepth + 1 }, (_, i) => ({
        _id: `level-${i + 1}`,
        parentId: i ? `level-${i}` : null,
        teamId,
        type: 'folder'
      }))
    );
    const props = { ...queries, isFolderType: folderType, maxDepth: defaultSubtreeMaxDepth };
    await expect(
      checkCreateResourceParent({ ...props, parentId: 'level-19', isFolder: true })
    ).resolves.toBeUndefined();
    await expect(
      checkCreateResourceParent({ ...props, parentId: 'level-20', isFolder: false })
    ).resolves.toBeUndefined();
    await expect(
      checkCreateResourceParent({ ...props, parentId: 'level-20', isFolder: true })
    ).rejects.toBe(CommonErrEnum.folderDepthLimit);
    await expect(
      checkCreateResourceParent({ ...props, parentId: 'level-21', isFolder: false })
    ).rejects.toBe(CommonErrEnum.folderDepthLimit);
    await expect(
      checkCreateResourceParent({
        ...queries,
        isFolderType: folderType,
        parentId: `level-${serviceEnv.MAX_FOLDER_DEPTH}`,
        isFolder: true
      })
    ).rejects.toBe(CommonErrEnum.folderDepthLimit);
  });

  it.each([false, true])(
    'rejects a leaf used as a direct or indirect parent (folder=%s)',
    async (isFolder) => {
      const { queries } = createQueries([
        { _id: 'leaf', parentId: null, teamId, type: 'file' },
        { _id: 'folder', parentId: 'leaf', teamId, type: 'folder' }
      ]);
      for (const parentId of ['leaf', 'folder']) {
        await expect(
          checkCreateResourceParent({
            parentId,
            ...queries,
            isFolder,
            isFolderType: folderType
          })
        ).rejects.toBe(CommonErrEnum.invalidParams);
        await expect(
          checkMoveFolderDepth({
            resourceId: 'moving',
            targetParentId: parentId,
            ...queries,
            isFolderType: folderType
          })
        ).rejects.toBe(CommonErrEnum.invalidParams);
      }
    }
  );

  it('allows leaves at the configured depth and rejects historical deeper parents', async () => {
    const docs: TestFolderDoc[] = Array.from(
      { length: serviceEnv.MAX_FOLDER_DEPTH + 1 },
      (_, i) => ({
        _id: `level-${i + 1}`,
        parentId: i ? `level-${i}` : null,
        teamId,
        type: 'folder'
      })
    );
    const { queries } = createQueries(docs);
    await expect(
      checkCreateResourceParent({
        parentId: `level-${serviceEnv.MAX_FOLDER_DEPTH}`,
        ...queries,
        isFolder: false,
        isFolderType: folderType
      })
    ).resolves.toBeUndefined();
    await expect(
      checkCreateResourceParent({
        parentId: `level-${serviceEnv.MAX_FOLDER_DEPTH + 1}`,
        ...queries,
        isFolder: false,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.folderDepthLimit);
  });
});
