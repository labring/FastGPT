/** 根据父文件夹路径和 ID 生成当前文件夹的祖先路径。 */
export const getFolderAncestorIds = ({
  parentId,
  parentAncestorIds
}: {
  parentId: string | null;
  parentAncestorIds?: string[];
}): string[] => (parentId ? [...(parentAncestorIds ?? []), parentId] : []);

/**
 * 查找目标文件夹路径中当前目录下的第一个文件夹。
 * `ancestorIds` 不包含 `folderId`；当前目录为 null 时表示文件夹树根节点。
 */
export const getVisibleChildFolderId = ({
  folderId,
  ancestorIds,
  currentFolderId
}: {
  folderId: string;
  ancestorIds: string[];
  currentFolderId: string | null;
}): string | null => {
  const path = [...ancestorIds, folderId];
  const currentIndex = currentFolderId === null ? -1 : path.indexOf(currentFolderId);

  if (currentIndex === path.length - 1) return null;
  if (currentFolderId !== null && currentIndex === -1) return null;

  return path[currentIndex + 1] ?? null;
};

/** 替换被移动文件夹的旧路径前缀，并保留后代路径后缀。 */
export const rewriteFolderAncestorIds = ({
  ancestorIds,
  oldPrefix,
  newPrefix
}: {
  ancestorIds: string[];
  oldPrefix: string[];
  newPrefix: string[];
}): string[] | null => {
  if (oldPrefix.length > ancestorIds.length) return null;
  if (!oldPrefix.every((id, index) => ancestorIds[index] === id)) return null;

  return [...newPrefix, ...ancestorIds.slice(oldPrefix.length)];
};
