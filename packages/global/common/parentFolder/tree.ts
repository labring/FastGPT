export type ParentFolderNode = {
  id: string;
  parentId: string | null;
};

/** 根据 parentId 关系解析文件夹祖先路径，可选地将浏览根目录作为相对路径起点。 */
export const getFolderPathIndex = ({
  folders,
  currentFolderId,
  maxDepth = 20
}: {
  folders: ParentFolderNode[];
  currentFolderId: string | null;
  maxDepth?: number;
}): Map<string, string[]> => {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const paths = new Map<string, string[]>();

  for (const folder of folders) {
    if (folder.id === currentFolderId) {
      paths.set(folder.id, []);
      continue;
    }

    const visited = new Set([folder.id]);
    const ancestors: string[] = [];
    let parentId = folder.parentId;
    let reachedBrowseRoot = currentFolderId === null;
    let validPath = true;

    while (parentId) {
      if (visited.has(parentId) || ancestors.length >= maxDepth - 1) {
        validPath = false;
        break;
      }
      if (currentFolderId && parentId === currentFolderId) {
        ancestors.unshift(parentId);
        reachedBrowseRoot = true;
        break;
      }
      const parent = folderById.get(parentId);
      if (!parent) {
        validPath = false;
        break;
      }
      visited.add(parentId);
      ancestors.unshift(parentId);
      parentId = parent.parentId;
    }

    if (!validPath || !reachedBrowseRoot) continue;
    paths.set(folder.id, ancestors);
  }

  return paths;
};
