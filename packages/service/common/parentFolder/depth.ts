import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { DEFAULT_MAX_FOLDER_DEPTH } from '@fastgpt/global/common/parentFolder/depth';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { serviceEnv } from '../../env';

type FolderResourceDoc = {
  _id: unknown;
  parentId?: string | null;
  teamId?: unknown;
  type?: string;
};

/** 兼容 App / Dataset / Skill 等 Mongoose Model 的最小查询接口。 */
type FolderResourceModel = {
  findById: (
    id: string,
    select?: string
  ) => {
    lean: <T = FolderResourceDoc>() => Promise<T | null>;
  };
  find: (
    query: { parentId?: string; teamId?: string },
    select?: string
  ) => {
    lean: <T = FolderResourceDoc>() => Promise<T[]>;
  };
};

type FolderTypeChecker = (type: string) => boolean;

type FolderDepthModelProps = {
  model: FolderResourceModel;
  teamId: string;
};

type CheckCreateFolderDepthProps = FolderDepthModelProps & {
  parentId: ParentIdType;
};

type CheckMoveFolderDepthProps = FolderDepthModelProps & {
  resourceId: string;
  targetParentId: ParentIdType;
  isFolderType: FolderTypeChecker;
};

/** 读取系统配置的最大目录深度，非法值在 env 层已回落默认值。 */
export const getMaxFolderDepth = () => serviceEnv.FASTGPT_MAX_FOLDER_DEPTH;

/**
 * 根据 parentId 向上追溯，计算父级目录深度。
 * 根目录深度为 0；遇到 parentId 成环或父级不存在时拒绝请求。
 */
const getParentFolderDepth = async ({
  parentId,
  teamId,
  model
}: FolderDepthModelProps & { parentId: ParentIdType }): Promise<number> => {
  if (!parentId) return 0;

  let depth = 0;
  let currentId: string | null = String(parentId);
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) {
      return Promise.reject(CommonErrEnum.invalidParams);
    }
    visited.add(currentId);

    const doc: FolderResourceDoc | null = await model
      .findById(currentId, 'parentId teamId')
      .lean<FolderResourceDoc>();
    if (!doc || String(doc.teamId) !== String(teamId)) {
      return Promise.reject(CommonErrEnum.invalidParams);
    }

    depth += 1;
    currentId = doc.parentId ? String(doc.parentId) : null;
  }

  return depth;
};

/**
 * 计算被移动资源子树中文件夹的最大相对深度。
 * 非文件夹资源返回 0；文件夹自身相对深度为 1。
 */
export const getSubtreeMaxFolderDepth = async ({
  resourceId,
  teamId,
  model,
  isFolderType
}: FolderDepthModelProps & {
  resourceId: string;
  isFolderType: FolderTypeChecker;
}): Promise<number> => {
  const resource = await model.findById(resourceId, 'type teamId').lean<FolderResourceDoc>();
  if (!resource || String(resource.teamId) !== String(teamId)) {
    return Promise.reject(CommonErrEnum.invalidResource);
  }

  if (!resource.type || !isFolderType(resource.type)) {
    return 0;
  }

  let maxRelativeDepth = 1;
  const queue: Array<{ id: string; depth: number }> = [{ id: resourceId, depth: 1 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    maxRelativeDepth = Math.max(maxRelativeDepth, current.depth);

    const children = await model
      .find({ parentId: current.id, teamId }, '_id type')
      .lean<FolderResourceDoc>();

    for (const child of children) {
      if (child.type && isFolderType(child.type)) {
        queue.push({ id: String(child._id), depth: current.depth + 1 });
      }
    }
  }

  return maxRelativeDepth;
};

/** 判断 targetId 是否位于 ancestorId 的子树中（含自身）。 */
const isInSubtree = async ({
  ancestorId,
  targetId,
  teamId,
  model
}: FolderDepthModelProps & {
  ancestorId: string;
  targetId: string;
}): Promise<boolean> => {
  if (ancestorId === targetId) return true;

  let currentId: string | null = targetId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === ancestorId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);

    const doc: FolderResourceDoc | null = await model
      .findById(currentId, 'parentId teamId')
      .lean<FolderResourceDoc>();
    if (!doc || String(doc.teamId) !== String(teamId)) return false;
    currentId = doc.parentId ? String(doc.parentId) : null;
  }

  return false;
};

/**
 * 创建文件夹前校验：parentDepth + 1 不得超过最大深度。
 * 权限校验应在本函数之前完成。
 */
export const checkCreateFolderDepth = async ({
  parentId,
  teamId,
  model
}: CheckCreateFolderDepthProps) => {
  const maxDepth = getMaxFolderDepth();
  const parentDepth = await getParentFolderDepth({ parentId, teamId, model });

  if (parentDepth + 1 > maxDepth) {
    return Promise.reject(CommonErrEnum.folderDepthLimit);
  }
};

/**
 * 移动资源前校验：目标父级深度 + 子树最大文件夹深度不得超过最大深度。
 * 同时阻止移动到自身或其子目录，避免 parentId 成环。
 */
export const checkMoveFolderDepth = async ({
  resourceId,
  targetParentId,
  teamId,
  model,
  isFolderType
}: CheckMoveFolderDepthProps) => {
  const maxDepth = getMaxFolderDepth();

  if (targetParentId && String(targetParentId) === String(resourceId)) {
    return Promise.reject(CommonErrEnum.invalidParams);
  }

  if (targetParentId) {
    const movingIntoDescendant = await isInSubtree({
      ancestorId: resourceId,
      targetId: String(targetParentId),
      teamId,
      model
    });
    if (movingIntoDescendant) {
      return Promise.reject(CommonErrEnum.invalidParams);
    }
  }

  const [targetParentDepth, subtreeMaxFolderDepth] = await Promise.all([
    getParentFolderDepth({ parentId: targetParentId, teamId, model }),
    getSubtreeMaxFolderDepth({ resourceId, teamId, model, isFolderType })
  ]);

  if (targetParentDepth + subtreeMaxFolderDepth > maxDepth) {
    return Promise.reject(CommonErrEnum.folderMoveDepthLimit);
  }
};

export { DEFAULT_MAX_FOLDER_DEPTH };
