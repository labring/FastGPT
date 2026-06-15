import { describe, expect, it } from 'vitest';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import {
  checkCreateFolderDepth,
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

const createModel = (docs: TestFolderDoc[]) => {
  const docMap = new Map(docs.map((doc) => [doc._id, doc]));
  const findByIdCalls: string[] = [];
  const findCalls: Array<{ parentId?: string; teamId?: string }> = [];

  return {
    model: {
      findById: (id: string) => ({
        lean: async () => {
          findByIdCalls.push(id);
          return docMap.get(id) ?? null;
        }
      }),
      find: (query: { parentId?: string; teamId?: string }) => ({
        lean: async () => {
          findCalls.push(query);
          return docs.filter(
            (doc) => doc.parentId === query.parentId && String(doc.teamId) === String(query.teamId)
          );
        }
      })
    },
    findByIdCalls,
    findCalls
  };
};

describe('folder depth checks', () => {
  it('allows creating a root folder without querying parent chain', async () => {
    const { model, findByIdCalls } = createModel([]);

    await expect(checkCreateFolderDepth({ parentId: null, teamId, model })).resolves.toBe(
      undefined
    );
    expect(findByIdCalls).toEqual([]);
  });

  it('allows creating the fourth level folder with default max depth', async () => {
    const { model } = createModel([
      { _id: 'level-1', parentId: null, teamId, type: 'folder' },
      { _id: 'level-2', parentId: 'level-1', teamId, type: 'folder' },
      { _id: 'level-3', parentId: 'level-2', teamId, type: 'folder' }
    ]);

    await expect(checkCreateFolderDepth({ parentId: 'level-3', teamId, model })).resolves.toBe(
      undefined
    );
  });

  it('rejects creating beyond the default max depth without scanning remaining ancestors', async () => {
    const { model, findByIdCalls } = createModel([
      { _id: 'level-1', parentId: null, teamId, type: 'folder' },
      { _id: 'level-2', parentId: 'level-1', teamId, type: 'folder' },
      { _id: 'level-3', parentId: 'level-2', teamId, type: 'folder' },
      { _id: 'level-4', parentId: 'level-3', teamId, type: 'folder' }
    ]);

    await expect(checkCreateFolderDepth({ parentId: 'level-4', teamId, model })).rejects.toBe(
      CommonErrEnum.folderDepthLimit
    );
    expect(findByIdCalls).toEqual(['level-4', 'level-3', 'level-2', 'level-1']);
  });

  it('allows moving a folder subtree to root when the subtree depth reaches the max depth exactly', async () => {
    const { model } = createModel([
      { _id: 'moving-1', parentId: null, teamId, type: 'folder' },
      { _id: 'moving-2', parentId: 'moving-1', teamId, type: 'folder' },
      { _id: 'moving-3', parentId: 'moving-2', teamId, type: 'folder' },
      { _id: 'moving-4', parentId: 'moving-3', teamId, type: 'folder' }
    ]);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-1',
        targetParentId: null,
        teamId,
        model,
        isFolderType: folderType
      })
    ).resolves.toBe(undefined);
  });

  it('allows moving a folder subtree when target depth plus subtree depth reaches the max depth exactly', async () => {
    const { model } = createModel([
      { _id: 'level-1', parentId: null, teamId, type: 'folder' },
      { _id: 'level-2', parentId: 'level-1', teamId, type: 'folder' },
      { _id: 'moving-1', parentId: null, teamId, type: 'folder' },
      { _id: 'moving-2', parentId: 'moving-1', teamId, type: 'folder' }
    ]);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-1',
        targetParentId: 'level-2',
        teamId,
        model,
        isFolderType: folderType
      })
    ).resolves.toBe(undefined);
  });

  it('allows moving a non-folder resource into the deepest allowed folder', async () => {
    const { model } = createModel([
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
        teamId,
        model,
        isFolderType: folderType
      })
    ).resolves.toBe(undefined);
  });

  it('rejects moving a folder into the deepest allowed folder', async () => {
    const { model } = createModel([
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
        teamId,
        model,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.folderMoveDepthLimit);
  });

  it('rejects moving into a target parent chain beyond max depth before scanning subtree', async () => {
    const { model, findByIdCalls, findCalls } = createModel([
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
        teamId,
        model,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.folderMoveDepthLimit);
    expect(findByIdCalls).toEqual(['level-5', 'level-4', 'level-3', 'level-2', 'level-1']);
    expect(findCalls).toEqual([]);
  });

  it('rejects moving a deep folder subtree once it exceeds remaining target depth', async () => {
    const { model, findCalls } = createModel([
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
        teamId,
        model,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.folderMoveDepthLimit);
    expect(findCalls).toEqual([
      { parentId: 'moving-1', teamId },
      { parentId: 'moving-2', teamId },
      { parentId: 'moving-3', teamId }
    ]);
  });

  it('rejects moving a folder to itself or one of its descendants', async () => {
    const { model } = createModel([
      { _id: 'moving-folder', parentId: null, teamId, type: 'folder' },
      { _id: 'child-folder', parentId: 'moving-folder', teamId, type: 'folder' }
    ]);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-folder',
        targetParentId: 'moving-folder',
        teamId,
        model,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-folder',
        targetParentId: 'child-folder',
        teamId,
        model,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);
  });

  it('rejects invalid parent chains and missing moved resources', async () => {
    const { model } = createModel([
      { _id: 'foreign-parent', parentId: null, teamId: 'team-2', type: 'folder' }
    ]);

    await expect(
      checkCreateFolderDepth({ parentId: 'missing-parent', teamId, model })
    ).rejects.toBe(CommonErrEnum.invalidParams);
    await expect(
      checkCreateFolderDepth({ parentId: 'foreign-parent', teamId, model })
    ).rejects.toBe(CommonErrEnum.invalidParams);
    await expect(
      checkMoveFolderDepth({
        resourceId: 'missing-resource',
        targetParentId: null,
        teamId,
        model,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.invalidResource);
  });

  it('rejects invalid target parents while moving resources', async () => {
    const { model } = createModel([
      { _id: 'foreign-parent', parentId: null, teamId: 'team-2', type: 'folder' },
      { _id: 'moving-folder', parentId: null, teamId, type: 'folder' }
    ]);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-folder',
        targetParentId: 'missing-parent',
        teamId,
        model,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);

    await expect(
      checkMoveFolderDepth({
        resourceId: 'moving-folder',
        targetParentId: 'foreign-parent',
        teamId,
        model,
        isFolderType: folderType
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);
  });

  it('rejects cyclic parent chains', async () => {
    const { model } = createModel([
      { _id: 'cycle-a', parentId: 'cycle-b', teamId, type: 'folder' },
      { _id: 'cycle-b', parentId: 'cycle-a', teamId, type: 'folder' }
    ]);

    await expect(checkCreateFolderDepth({ parentId: 'cycle-a', teamId, model })).rejects.toBe(
      CommonErrEnum.invalidParams
    );
  });
});
