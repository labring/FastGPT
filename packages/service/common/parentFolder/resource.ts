export type FolderTreeNode = {
  _id: unknown;
  parentId?: unknown;
  type: string;
};

/**
 * 按层级批量遍历所有文件夹根节点，返回各根节点下满足资源条件的后代。
 * 每轮对所有前沿父节点只查询一次，避免逐目录递归查询；访问集合用于避免循环和重复节点。
 */
export const getFolderDescendantResources = async ({
  folderIds,
  fetchChildren,
  shouldTraverse,
  isResource
}: {
  folderIds: string[];
  fetchChildren: (parentIds: string[]) => Promise<FolderTreeNode[]>;
  shouldTraverse: (node: FolderTreeNode) => boolean;
  isResource: (node: FolderTreeNode) => boolean;
}): Promise<Map<string, FolderTreeNode[]>> => {
  const uniqueFolderIds = Array.from(new Set(folderIds));
  const childrenByParent = new Map<string, FolderTreeNode[]>();
  const discoveredIds = new Set(uniqueFolderIds);
  let frontier = uniqueFolderIds;

  while (frontier.length > 0) {
    const children = await fetchChildren(frontier);
    const nextFrontier = new Set<string>();

    for (const child of children) {
      const parentId = child.parentId ? String(child.parentId) : '';
      if (!parentId) continue;

      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(child);
      childrenByParent.set(parentId, siblings);

      const childId = String(child._id);
      if (shouldTraverse(child) && !discoveredIds.has(childId)) {
        discoveredIds.add(childId);
        nextFrontier.add(childId);
      }
    }
    frontier = Array.from(nextFrontier);
  }

  return new Map(
    uniqueFolderIds.map((folderId) => {
      const resources: FolderTreeNode[] = [];
      const visited = new Set<string>([folderId]);
      const stack = [...(childrenByParent.get(folderId) ?? [])];

      while (stack.length > 0) {
        const node = stack.pop();
        if (!node) continue;
        const nodeId = String(node._id);
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        if (isResource(node)) resources.push(node);
        if (shouldTraverse(node)) stack.push(...(childrenByParent.get(nodeId) ?? []));
      }

      return [folderId, resources];
    })
  );
};
