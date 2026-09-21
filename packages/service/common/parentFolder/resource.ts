type FolderTreeNode = {
  _id: unknown;
  parentId?: unknown;
  type: string;
};

/**
 * Expands all visible folder roots breadth-first. Each database fetch covers one
 * tree level for every root, so a page with many folders does not issue a
 * separate recursive query for each folder.
 */
export const getFolderDescendantResourceIds = async ({
  folderIds,
  fetchChildren,
  shouldTraverse,
  isResource
}: {
  folderIds: string[];
  fetchChildren: (parentIds: string[]) => Promise<FolderTreeNode[]>;
  shouldTraverse: (node: FolderTreeNode) => boolean;
  isResource: (node: FolderTreeNode) => boolean;
}): Promise<Map<string, string[]>> => {
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
      const resourceIds: string[] = [];
      const visited = new Set<string>([folderId]);
      const stack = [...(childrenByParent.get(folderId) ?? [])];

      while (stack.length > 0) {
        const node = stack.pop();
        if (!node) continue;
        const nodeId = String(node._id);
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        if (isResource(node)) resourceIds.push(nodeId);
        if (shouldTraverse(node)) stack.push(...(childrenByParent.get(nodeId) ?? []));
      }

      return [folderId, resourceIds];
    })
  );
};
