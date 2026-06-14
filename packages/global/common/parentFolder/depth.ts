import type { ParentTreePathItemType } from './type';

/** 允许的最深文件夹层级，默认 4（根目录下最多 4 层文件夹）。 */
export const DEFAULT_MAX_FOLDER_DEPTH = 4;

/** 归一化路由 parentId：仅保留非空字符串，其余视为根目录。 */
export const normalizeParentId = (parentId: unknown): string | null => {
  if (typeof parentId === 'string' && parentId.length > 0) {
    return parentId;
  }
  return null;
};

/**
 * 判断 paths 是否与当前 parentId 对齐。
 * 切换目录时 useRequest 可能短暂保留上一层 paths，此时不应据此隐藏「新建文件夹」。
 */
export const isPathsSyncedWithParent = (
  parentId: string | null | undefined,
  paths: ReadonlyArray<Pick<ParentTreePathItemType, 'parentId'>>
) => {
  const normalizedParentId = normalizeParentId(parentId);

  if (!normalizedParentId) {
    return paths.length === 0;
  }

  if (paths.length === 0) {
    return false;
  }

  const lastPathId = paths[paths.length - 1]?.parentId;
  return lastPathId != null && String(lastPathId) === normalizedParentId;
};

/**
 * 根据 parentId 与路径数组计算当前所在文件夹层级。
 * 根目录列表页为 0；进入第 n 层文件夹时等于 paths.length（paths 含当前文件夹）。
 */
export const getCurrentFolderLevel = (parentId: string | null | undefined, pathsLength: number) =>
  normalizeParentId(parentId) ? pathsLength : 0;

/**
 * 是否允许在当前位置新建子文件夹。
 * 规则：新建后的文件夹层级 = 当前层级 + 1，不得超过 maxFolderLevel。
 */
export const canCreateFolderAtDepth = (currentFolderLevel: number, maxFolderLevel?: number) => {
  const max = maxFolderLevel ?? DEFAULT_MAX_FOLDER_DEPTH;
  return currentFolderLevel + 1 <= max;
};

/**
 * 结合 parentId 与 paths 判断是否可新建子文件夹（前端列表页使用）。
 * paths 未与 parentId 对齐时返回 true，避免 stale paths 误隐藏按钮；后端仍会兜底校验。
 */
export const canCreateSubFolder = (
  parentId: string | null | undefined,
  pathsOrLength: ReadonlyArray<Pick<ParentTreePathItemType, 'parentId'>> | number,
  maxFolderLevel?: number
) => {
  const normalizedParentId = normalizeParentId(parentId);

  if (typeof pathsOrLength === 'number') {
    return canCreateFolderAtDepth(
      getCurrentFolderLevel(normalizedParentId, pathsOrLength),
      maxFolderLevel
    );
  }

  if (!isPathsSyncedWithParent(normalizedParentId, pathsOrLength)) {
    return true;
  }

  return canCreateFolderAtDepth(
    getCurrentFolderLevel(normalizedParentId, pathsOrLength.length),
    maxFolderLevel
  );
};
