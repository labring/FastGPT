import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { defaultSubtreeMaxDepth } from '@fastgpt/global/common/parentFolder/subtree';

type FolderPathDoc = {
  _id: unknown;
  parentId?: unknown | null;
};

/** 在调用方指定的文件夹树中解析仅用于展示的面包屑 ID 和名称。 */
export const getFolderParentPathItems = async ({
  folderId,
  findFolder,
  maxDepth = defaultSubtreeMaxDepth
}: {
  folderId: string | null;
  findFolder: (id: string) => Promise<(FolderPathDoc & { name: string }) | null>;
  maxDepth?: number;
}): Promise<Array<{ parentId: string; parentName: string }>> => {
  const paths: Array<{ parentId: string; parentName: string }> = [];
  const visited = new Set<string>();
  let currentId = folderId;

  while (currentId && paths.length < maxDepth && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = await findFolder(currentId);
    if (!folder) break;
    paths.push({ parentId: currentId, parentName: folder.name });
    currentId = folder.parentId ? String(folder.parentId) : null;
  }

  return paths.reverse();
};

/** 根据权威 parentId 链解析祖先路径；调用方必须将 findFolder 限定在单一团队和目录树中。 */
export const getFolderAncestorIdsFromParentId = async ({
  parentId,
  findFolder,
  maxDepth = defaultSubtreeMaxDepth
}: {
  parentId: string | null;
  findFolder: (id: string) => Promise<FolderPathDoc | null>;
  maxDepth?: number;
}): Promise<string[]> => {
  const path: string[] = [];
  const visited = new Set<string>();
  let currentId = parentId;

  while (currentId) {
    if (visited.has(currentId) || path.length >= maxDepth - 1) {
      throw CommonErrEnum.invalidParams;
    }
    visited.add(currentId);

    const folder = await findFolder(currentId);
    if (!folder) throw CommonErrEnum.invalidParams;
    path.push(String(folder._id));
    currentId = folder.parentId ? String(folder.parentId) : null;
  }

  return path.reverse();
};

/** 按有界的广度优先批次，根据 parentId 链路重建所有后代文件夹路径。 */
export const rewriteFolderSubtreeAncestorIds = async ({
  rootId,
  rootAncestorIds,
  findChildFolders,
  writeAncestorIds,
  maxDepth = defaultSubtreeMaxDepth
}: {
  rootId: string;
  rootAncestorIds: string[];
  findChildFolders: (parentIds: string[]) => Promise<FolderPathDoc[]>;
  writeAncestorIds: (updates: Array<{ id: string; ancestorIds: string[] }>) => Promise<void>;
  maxDepth?: number;
}): Promise<void> => {
  let frontier = [{ id: rootId, path: [...rootAncestorIds, rootId] }];
  const visited = new Set([rootId]);

  for (let depth = 1; frontier.length > 0; depth++) {
    const children = await findChildFolders(frontier.map(({ id }) => id));
    if (children.length === 0) break;
    if (depth >= maxDepth) throw CommonErrEnum.folderMoveDepthLimit;

    const parentsById = new Map(frontier.map((folder) => [folder.id, folder.path]));
    const updates = children.map((child) => {
      const id = String(child._id);
      const parentId = child.parentId ? String(child.parentId) : '';
      if (visited.has(id)) throw CommonErrEnum.invalidParams;
      visited.add(id);
      const parentPath = parentsById.get(parentId);
      if (!parentPath) throw CommonErrEnum.invalidParams;
      return { id, ancestorIds: parentPath };
    });

    await writeAncestorIds(updates);
    frontier = updates.map(({ id, ancestorIds }) => ({ id, path: [...ancestorIds, id] }));
  }
};
