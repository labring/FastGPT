import z from 'zod';
import type { ParentTreePathItemType } from './type';

/** 允许的最深文件夹层级，默认 4（根目录下最多 4 层文件夹）。 */
export const DEFAULT_MAX_FOLDER_DEPTH = 4;

export const resolveMaxFolderDepth = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_FOLDER_DEPTH;
  }
  return value;
};

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
  const max = resolveMaxFolderDepth(maxFolderLevel);
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

/** 列表页中文件夹卡片作为 drop 目标时，移入资源的父级深度。 */
export const getDropTargetFolderDepth = (currentFolderLevel: number) => currentFolderLevel + 1;

/** 移动资源到目标文件夹后，整体深度是否仍在限制内。非文件夹 subtreeMaxFolderDepth 为 0。 */
export const canMoveResourceToTarget = (
  targetParentDepth: number,
  subtreeMaxFolderDepth: number,
  maxFolderLevel?: number
) => targetParentDepth + subtreeMaxFolderDepth <= resolveMaxFolderDepth(maxFolderLevel);

/* GET /api/common/parentFolder/subtreeDepth — 拖拽移动前查询子树最大文件夹深度 */
export const ParentFolderResourceTypeSchema = z.enum(['app', 'dataset', 'skill']);

export const GetSubtreeMaxFolderDepthQuerySchema = z.object({
  resourceType: ParentFolderResourceTypeSchema.meta({
    example: 'app',
    description: '资源类型'
  }),
  resourceId: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '资源 ID'
  })
});
export type GetSubtreeMaxFolderDepthQueryType = z.infer<typeof GetSubtreeMaxFolderDepthQuerySchema>;

export const GetSubtreeMaxFolderDepthResponseSchema = z.object({
  subtreeMaxFolderDepth: z.number().meta({
    example: 1,
    description: '文件夹子树最大相对深度，非文件夹为 0'
  })
});
export type GetSubtreeMaxFolderDepthResponseType = z.infer<
  typeof GetSubtreeMaxFolderDepthResponseSchema
>;
