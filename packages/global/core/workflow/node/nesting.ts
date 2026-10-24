type NestedNode = { nodeId: string; parentNodeId?: string };

/** 返回由近到远的祖先 ID；缺失父节点或导入数据成环时停止，不包含节点自身。 */
export const getNodeAncestorIds = ({
  nodeId,
  getNodeById
}: {
  nodeId: string;
  getNodeById: (nodeId: string) => NestedNode | undefined;
}): string[] => {
  const ancestors: string[] = [];
  const visited = new Set([nodeId]);
  let parentId = getNodeById(nodeId)?.parentNodeId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    ancestors.push(parentId);
    parentId = getNodeById(parentId)?.parentNodeId;
  }
  return ancestors;
};

/** 收集容器的所有后代，供移动、选择和删除共用；只收集直接子节点会遗漏嵌套容器的内容。 */
export const getNodeDescendantIds = ({
  nodeId,
  nodes
}: {
  nodeId: string;
  nodes: NestedNode[];
}): Set<string> => {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentNodeId) continue;
    const siblings = children.get(node.parentNodeId) ?? [];
    siblings.push(node.nodeId);
    children.set(node.parentNodeId, siblings);
  }
  const descendants = new Set<string>();
  const pending = [nodeId];
  const visited = new Set([nodeId]);
  while (pending.length) {
    const parentId = pending.pop()!;
    for (const childId of children.get(parentId) ?? []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      descendants.add(childId);
      pending.push(childId);
    }
  }
  return descendants;
};
