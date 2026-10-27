import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { serviceEnv } from '../../env';

type FolderResourceDoc = {
  _id: unknown;
  parentId?: string | null;
  type?: string;
};

type FolderTypeChecker = (type: string) => boolean;

/** 仅注入按 ID 读取数据的函数；查询范围、事务和数据库实现由业务侧绑定。 */
type FolderLookupProps = {
  findResource: (id: string) => Promise<FolderResourceDoc | null>;
};

type FolderSubtreeLookupProps = FolderLookupProps & {
  findChildren: (parentId: string) => Promise<FolderResourceDoc[]>;
};

type CheckCreateFolderDepthProps = FolderLookupProps & {
  parentId: ParentIdType;
  isFolderType: FolderTypeChecker;
};

type CheckMoveFolderDepthProps = FolderSubtreeLookupProps & {
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
  findResource,
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

    const doc = await findResource(currentId);
    if (!doc || !doc.type || !isFolderType(doc.type)) {
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
  findResource,
  findChildren,
  isFolderType,
  maxAllowedDepth
}: FolderSubtreeLookupProps & {
  resourceId: string;
  isFolderType: FolderTypeChecker;
} & DepthLimitOptions): Promise<number> => {
  const resource = await findResource(resourceId);
  if (!resource) {
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

    const children = await findChildren(current.id);

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
  findResource
}: FolderLookupProps & {
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

    const doc = await findResource(currentId);
    if (!doc) return false;
    currentId = doc.parentId ? String(doc.parentId) : null;
  }

  return false;
};

/**
 * 创建资源前校验父级链：所有父级必须是合法文件夹，不允许缺失或成环。
 * 文件夹占一层，叶子资源不增加目录层级；默认使用配置上限，外部库等业务可指定自身上限。
 * 调用方须先完成权限校验，并将查询绑定团队、知识库等业务范围。
 */
export const checkCreateResourceParent = async ({
  parentId,
  findResource,
  isFolderType,
  isFolder,
  maxDepth = serviceEnv.MAX_FOLDER_DEPTH
}: CheckCreateFolderDepthProps & { isFolder: boolean; maxDepth?: number }) => {
  await getParentFolderDepth({
    parentId,
    findResource,
    isFolderType,
    maxAllowedDepth: maxDepth - (isFolder ? 1 : 0),
    limitErr: CommonErrEnum.folderDepthLimit
  });
};

/** 创建文件夹前校验：parentDepth + 1 不得超过最大深度，父级必须是合法文件夹。 */
export const checkCreateFolderDepth = async (props: CheckCreateFolderDepthProps) =>
  checkCreateResourceParent({ ...props, isFolder: true });

/**
 * 移动资源前校验：目标父级深度 + 子树最大文件夹深度不得超过最大深度。
 * 同时阻止移动到自身或其子目录，避免 parentId 成环；两个查询回调必须绑定相同业务范围。
 */
export const checkMoveFolderDepth = async ({
  resourceId,
  targetParentId,
  findResource,
  findChildren,
  isFolderType
}: CheckMoveFolderDepthProps) => {
  const maxDepth = serviceEnv.MAX_FOLDER_DEPTH;

  if (targetParentId && String(targetParentId) === String(resourceId)) {
    throw CommonErrEnum.invalidParams;
  }

  const targetParentDepth = await getParentFolderDepth({
    parentId: targetParentId,
    findResource,
    isFolderType,
    maxAllowedDepth: maxDepth,
    limitErr: CommonErrEnum.folderMoveDepthLimit
  });

  if (targetParentId) {
    const movingIntoDescendant = await isInSubtree({
      ancestorId: resourceId,
      targetId: String(targetParentId),
      findResource
    });
    if (movingIntoDescendant) {
      throw CommonErrEnum.invalidParams;
    }
  }

  await getSubtreeMaxFolderDepth({
    resourceId,
    findResource,
    findChildren,
    isFolderType,
    maxAllowedDepth: maxDepth - targetParentDepth
  });
};
