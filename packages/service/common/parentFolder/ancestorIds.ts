import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { defaultSubtreeMaxDepth } from '@fastgpt/global/common/parentFolder/subtree';
import { serviceEnv } from '../../env';

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

/** 解析写入用的祖先路径，预留当前文件夹的一层；查询必须限定在同一团队和目录树。 */
export const getFolderAncestorIdsFromParentId = async ({
  parentId,
  findFolder,
  maxDepth = serviceEnv.MAX_FOLDER_DEPTH
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

/**
 * 按 parentId 重建后代文件夹路径，写入后的绝对层级不得超过 maxDepth，包含根节点的祖先。
 * 调用方应在同一事务中写入，使后续发现超深或成环时能回滚此前批次。
 */
export const rewriteFolderSubtreeAncestorIds = async ({
  rootId,
  rootAncestorIds,
  findChildFolders,
  writeAncestorIds,
  maxDepth = serviceEnv.MAX_FOLDER_DEPTH
}: {
  rootId: string;
  rootAncestorIds: string[];
  findChildFolders: (parentIds: string[]) => Promise<FolderPathDoc[]>;
  writeAncestorIds: (updates: Array<{ id: string; ancestorIds: string[] }>) => Promise<void>;
  maxDepth?: number;
}): Promise<void> => {
  const rootDepth = rootAncestorIds.length + 1;
  if (rootDepth > maxDepth) throw CommonErrEnum.folderMoveDepthLimit;

  let frontier = [{ id: rootId, path: [...rootAncestorIds, rootId] }];
  const visited = new Set([rootId]);

  for (let depth = 1; frontier.length > 0; depth++) {
    const children = await findChildFolders(frontier.map(({ id }) => id));
    if (children.length === 0) break;
    if (rootDepth + depth > maxDepth) throw CommonErrEnum.folderMoveDepthLimit;

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
