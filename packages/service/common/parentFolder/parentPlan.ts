export type ParentPlanNode = { id: string; parentId: string | null };

/**
 * 校验批量变更后的最终父级图，支持移动和尚未落库的新节点。
 * loadParents 由调用者绑定资源类型、团队/知识库范围及事务；null 才是根，查不到祖先必须报错。
 * 按层批量读取并缓存共同祖先，迭代验证避免深树递归溢出；不检查与本轮变更无关的子树。
 */
export const assertParentPlanAcyclic = async ({
  changes,
  loadParents
}: {
  changes: ParentPlanNode[];
  loadParents: (ids: string[]) => Promise<ParentPlanNode[]>;
}): Promise<void> => {
  const parents = new Map<string, string | null>();
  for (const { id, parentId } of changes) {
    if (parents.has(id) && parents.get(id) !== parentId) {
      throw new Error(`Conflicting parent plan: ${id}`);
    }
    parents.set(id, parentId);
  }

  const visited = new Set<string>();
  let frontier = [...parents.keys()];
  while (frontier.length) {
    const missing = frontier.filter((id) => !parents.has(id));
    for (let offset = 0; offset < missing.length; offset += 1000) {
      const ids = missing.slice(offset, offset + 1000);
      const loaded = new Map((await loadParents(ids)).map((node) => [node.id, node.parentId]));
      for (const id of ids) {
        if (!loaded.has(id)) throw new Error(`Missing parent in plan: ${id}`);
        parents.set(id, loaded.get(id)!);
      }
    }
    const next = new Set<string>();
    for (const id of frontier) {
      visited.add(id);
      const parentId = parents.get(id)!;
      if (parentId !== null && !visited.has(parentId)) next.add(parentId);
    }
    frontier = [...next].filter((id) => !visited.has(id));
  }

  const verified = new Set<string>();
  for (const { id } of changes) {
    const path = new Set<string>();
    let current: string | null = id;
    while (current !== null && !verified.has(current)) {
      if (path.has(current)) throw new Error(`Circular parent plan: ${current}`);
      path.add(current);
      current = parents.get(current)!;
    }
    for (const nodeId of path) verified.add(nodeId);
  }
};
