import { isObjectId } from '../string/utils';

/** 层序遍历的默认深度上限：脏树（成环 / 超深）不得拖垮请求。 */
export const defaultSubtreeMaxDepth = 20;
/** 单次遍历默认累计访问的文件夹数上限，防止超大子树把内存打满。 */
export const defaultSubtreeMaxNodes = 20000;

export type SubtreeFolderIdsResult = {
  /** 后代文件夹 ID（不含 rootIds 自身），层序。 */
  ids: string[];
  /** 是否触达上限被截断：为 true 时 ids 可能缺少更深的文件夹。 */
  truncated: boolean;
};

/**
 * 按层批量收集 parentId 树中的后代**文件夹** ID。
 *
 * 不绑定具体 Model —— 只依赖调用方传入 findChildFolders，因此 App / Dataset / Collection
 * 等各类 parentId 树可共用（同域工具见 common/parentFolder/depth.ts）。
 *
 * 每层只调用一次 findChildFolders（入参为该层全部文件夹 ID），避免逐节点串行递归：
 * 逐节点写法在 4 万节点量级的树上就是万次量级的串行往返，只适合删除等低 QPS 场景。
 *
 * visited 兼作环保护：脏数据成环时不再下探。
 * 触达 maxDepth / maxNodes 时截断，返回已收集部分，由调用方决定降级方式（通常是告警 + 接受结果不全）。
 * 非 24 位 hex 的 rootIds 会被忽略：HTTP 脏参数不应进入查询引发 CastError。
 */
export async function getDescendantFolderIds({
  rootIds,
  findChildFolders,
  maxDepth = defaultSubtreeMaxDepth,
  maxNodes = defaultSubtreeMaxNodes
}: {
  /** 遍历起点（自身不计入结果，但计入环保护）。 */
  rootIds: string[];
  /** 给定一层文件夹 ID，返回它们的文件夹子级 ID。 */
  findChildFolders: (folderIds: string[]) => Promise<string[]>;
  maxDepth?: number;
  maxNodes?: number;
}): Promise<SubtreeFolderIdsResult> {
  const validRootIds = rootIds.filter(isObjectId);
  if (validRootIds.length === 0) return { ids: [], truncated: false };

  const ids: string[] = [];
  const visited = new Set(validRootIds);
  let frontier = [...validRootIds];
  let truncated = false;

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const children = await findChildFolders(frontier);

    const nextFrontier: string[] = [];
    for (const childId of children) {
      if (visited.has(childId)) continue;
      visited.add(childId);

      if (ids.length >= maxNodes) {
        truncated = true;
        break;
      }

      ids.push(childId);
      nextFrontier.push(childId);
    }
    if (truncated) break;

    frontier = nextFrontier;
  }

  // 深度用尽但仍留有未展开的文件夹 ⇒ 结果不完整
  if (frontier.length > 0) truncated = true;

  return { ids, truncated };
}
