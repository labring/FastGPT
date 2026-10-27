import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { serviceEnv } from '../../env';
import { defaultSubtreeMaxDepth } from '@fastgpt/global/common/parentFolder/subtree';

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
    lean: () => Promise<FolderResourceDoc | null>;
  };
  find: (
    query: { parentId?: string; teamId?: string },
    select?: string
  ) => {
    lean: () => Promise<FolderResourceDoc[]>;
  };
};

type FolderTypeChecker = (type: string) => boolean;

type ParentFolderModelProps = {
  model: Pick<FolderResourceModel, 'findById'>;
  teamId: string;
};

type FolderDepthModelProps = ParentFolderModelProps & { model: FolderResourceModel };

type CheckCreateFolderDepthProps = ParentFolderModelProps & {
  parentId: ParentIdType;
  isFolderType: FolderTypeChecker;
};

type CheckMoveFolderDepthProps = FolderDepthModelProps & {
  resourceId: string;
  targetParentId: ParentIdType;
  isFolderType: FolderTypeChecker;
};

type DepthLimitOptions = {
  maxAllowedDepth?: number;
  limitErr?: CommonErrEnum;
};

/**
 * 根据 parentId 向上追溯，计算父级目录深度。
 * 根目录深度为 0；遇到 parentId 成环或父级不存在时拒绝请求。
 * 传入 maxAllowedDepth 时，一旦已超过允许深度就直接抛错，避免继续无意义地向上扫描。
 */
const getParentFolderDepth = async ({
  parentId,
  teamId,
  model,
  isFolderType,
  maxAllowedDepth,
  limitErr = CommonErrEnum.invalidParams
}: CheckCreateFolderDepthProps & DepthLimitOptions): Promise<number> => {
  if (!parentId) return 0;

  let depth = 0;
  let currentId: string | null = String(parentId);
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) {
      throw CommonErrEnum.invalidParams;
    }
    visited.add(currentId);

    const doc: FolderResourceDoc | null = await model
      .findById(currentId, 'parentId teamId type')
      .lean();
    if (!doc || String(doc.teamId) !== String(teamId) || !doc.type || !isFolderType(doc.type)) {
      throw CommonErrEnum.invalidParams;
    }

    depth += 1;
    if (maxAllowedDepth !== undefined && depth > maxAllowedDepth) {
      throw limitErr;
    }

    currentId = doc.parentId ? String(doc.parentId) : null;
  }

  return depth;
};

/**
 * 计算被移动资源子树中文件夹的最大相对深度。
 * 非文件夹资源返回 0；文件夹自身相对深度为 1。
 * 传入 maxAllowedDepth 时，一旦子树相对深度超过目标剩余空间就直接抛错。
 */
const getSubtreeMaxFolderDepth = async ({
  resourceId,
  teamId,
  model,
  isFolderType,
  maxAllowedDepth
}: FolderDepthModelProps & {
  resourceId: string;
  isFolderType: FolderTypeChecker;
} & DepthLimitOptions): Promise<number> => {
  const resource = await model.findById(resourceId, 'type teamId').lean();
  if (!resource || String(resource.teamId) !== String(teamId)) {
    throw CommonErrEnum.invalidResource;
  }

  if (!resource.type || !isFolderType(resource.type)) {
    return 0;
  }

  let maxRelativeDepth = 1;
  const queue: Array<{ id: string; depth: number }> = [{ id: resourceId, depth: 1 }];
  const visited = new Set<string>([resourceId]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    maxRelativeDepth = Math.max(maxRelativeDepth, current.depth);
    if (maxAllowedDepth !== undefined && current.depth > maxAllowedDepth) {
      throw CommonErrEnum.folderMoveDepthLimit;
    }

    const children = await model.find({ parentId: current.id, teamId }, '_id type').lean();

    for (const child of children) {
      if (!child.type || !isFolderType(child.type)) continue;

      const childId = String(child._id);
      if (visited.has(childId)) continue;
      visited.add(childId);
      queue.push({ id: childId, depth: current.depth + 1 });
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
    if (visited.has(currentId)) throw CommonErrEnum.invalidParams;
    visited.add(currentId);

    const doc: FolderResourceDoc | null = await model.findById(currentId, 'parentId teamId').lean();
    if (!doc || String(doc.teamId) !== String(teamId)) return false;
    currentId = doc.parentId ? String(doc.parentId) : null;
  }

  return false;
};

/**
 * 创建资源前校验父级链：所有父级必须是同团队的合法文件夹，不允许缺失或成环。
 * 文件夹占一层，遵循新建深度策略；叶子资源不增加目录深度，允许放入历史深层目录，
 * 但仍受独立的遍历上限保护。调用方须先完成权限校验，并按需将 model 查询限定到同一知识库。
 */
export const checkCreateResourceParent = async ({
  parentId,
  teamId,
  model,
  isFolderType,
  isFolder
}: CheckCreateFolderDepthProps & { isFolder: boolean }) => {
  await getParentFolderDepth({
    parentId,
    teamId,
    model,
    isFolderType,
    maxAllowedDepth: isFolder ? serviceEnv.MAX_FOLDER_DEPTH - 1 : defaultSubtreeMaxDepth,
    limitErr: isFolder ? CommonErrEnum.folderDepthLimit : CommonErrEnum.invalidParams
  });
};

/** 创建文件夹前校验：parentDepth + 1 不得超过最大深度，父级必须是合法文件夹。 */
export const checkCreateFolderDepth = async (props: CheckCreateFolderDepthProps) =>
  checkCreateResourceParent({ ...props, isFolder: true });

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
  const maxDepth = serviceEnv.MAX_FOLDER_DEPTH;

  if (targetParentId && String(targetParentId) === String(resourceId)) {
    throw CommonErrEnum.invalidParams;
  }

  const targetParentDepth = await getParentFolderDepth({
    parentId: targetParentId,
    teamId,
    model,
    isFolderType,
    maxAllowedDepth: maxDepth,
    limitErr: CommonErrEnum.folderMoveDepthLimit
  });

  if (targetParentId) {
    const movingIntoDescendant = await isInSubtree({
      ancestorId: resourceId,
      targetId: String(targetParentId),
      teamId,
      model
    });
    if (movingIntoDescendant) {
      throw CommonErrEnum.invalidParams;
    }
  }

  await getSubtreeMaxFolderDepth({
    resourceId,
    teamId,
    model,
    isFolderType,
    maxAllowedDepth: maxDepth - targetParentDepth
  });
};
