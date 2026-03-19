import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

export type EdgeIndex = {
  bySource: Map<string, RuntimeEdgeItemType[]>;
  byTarget: Map<string, RuntimeEdgeItemType[]>;
};

export type EdgeType = 'tree' | 'back' | 'forward' | 'cross';

export interface SCCResult {
  nodeToSCC: Map<string, number>;
  sccSizes: Map<number, number>;
}

/**
 * 使用 Tarjan 算法找出所有强连通分量（SCC）
 * SCC 大小 > 1 的节点表示在循环中
 */
export function findSCCs(runtimeNodes: RuntimeNodeItemType[], edgeIndex: EdgeIndex): SCCResult {
  const nodeToSCC = new Map<string, number>();
  const sccSizes = new Map<number, number>();

  let sccId = 0;
  const stack: string[] = [];
  const inStack = new Set<string>();
  const lowLink = new Map<string, number>();
  const discoveryTime = new Map<string, number>();
  let time = 0;

  function tarjan(nodeId: string) {
    discoveryTime.set(nodeId, time);
    lowLink.set(nodeId, time);
    time++;
    stack.push(nodeId);
    inStack.add(nodeId);

    const outEdges = edgeIndex.bySource.get(nodeId) || [];
    for (const edge of outEdges) {
      const targetId = edge.target;

      if (!discoveryTime.has(targetId)) {
        tarjan(targetId);
        lowLink.set(nodeId, Math.min(lowLink.get(nodeId)!, lowLink.get(targetId)!));
      } else if (inStack.has(targetId)) {
        lowLink.set(nodeId, Math.min(lowLink.get(nodeId)!, discoveryTime.get(targetId)!));
      }
    }

    // 如果是 SCC 的根节点
    if (lowLink.get(nodeId) === discoveryTime.get(nodeId)) {
      const sccNodes: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        inStack.delete(w);
        nodeToSCC.set(w, sccId);
        sccNodes.push(w);
      } while (w !== nodeId);

      sccSizes.set(sccId, sccNodes.length);
      sccId++;
    }
  }

  // 从所有未访问节点开始
  for (const node of runtimeNodes) {
    if (!discoveryTime.has(node.nodeId)) {
      tarjan(node.nodeId);
    }
  }

  return { nodeToSCC, sccSizes };
}

/**
 * 判断节点是否在循环中
 */
export function isNodeInCycle(
  nodeId: string,
  nodeToSCC: Map<string, number>,
  sccSizes: Map<number, number>
): boolean {
  const sccId = nodeToSCC.get(nodeId);
  if (sccId === undefined) return false;

  const size = sccSizes.get(sccId) || 0;
  return size > 1;
}

/**
 * 对整个工作流图进行一次 DFS，标记每条边的类型
 *
 * 边类型:
 * - tree: 树边（DFS 树中的边）
 * - back: 回边（从后代指向当前路径上祖先的边）→ 循环边
 * - forward: 前向边（从祖先指向后代的非树边）
 * - cross: 跨边（连接不同子树的边）
 */
export function classifyEdgesByDFS(
  runtimeNodes: RuntimeNodeItemType[],
  edgeIndex: EdgeIndex
): Map<string, EdgeType> {
  const edgeTypes = new Map<string, EdgeType>();

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const finished = new Set<string>();
  const discoveryTime = new Map<string, number>();
  const finishTime = new Map<string, number>();
  let time = 0;

  function dfs(nodeId: string) {
    visited.add(nodeId);
    inStack.add(nodeId);
    discoveryTime.set(nodeId, ++time);

    const outEdges = edgeIndex.bySource.get(nodeId) || [];

    for (const edge of outEdges) {
      const edgeKey = `${edge.source}-${edge.target}-${edge.sourceHandle || 'default'}`;
      const targetId = edge.target;

      if (!visited.has(targetId)) {
        // 目标节点未访问 → 树边
        edgeTypes.set(edgeKey, 'tree');
        dfs(targetId);
      } else if (inStack.has(targetId)) {
        // 目标节点在当前 DFS 路径上 → 回边（循环边）
        edgeTypes.set(edgeKey, 'back');
      } else if (discoveryTime.get(edge.source)! < discoveryTime.get(targetId)!) {
        // 从祖先指向后代的非树边 → 前向边
        edgeTypes.set(edgeKey, 'forward');
      } else {
        // 跨边
        edgeTypes.set(edgeKey, 'cross');
      }
    }

    inStack.delete(nodeId);
    finished.add(nodeId);
    finishTime.set(nodeId, ++time);
  }

  // 从所有入口节点开始 DFS
  const entryNodes = runtimeNodes.filter((node) => {
    const inEdges = edgeIndex.byTarget.get(node.nodeId) || [];
    return inEdges.length === 0;
  });

  for (const node of entryNodes) {
    if (!visited.has(node.nodeId)) {
      dfs(node.nodeId);
    }
  }

  // 处理孤立节点
  for (const node of runtimeNodes) {
    if (!visited.has(node.nodeId)) {
      dfs(node.nodeId);
    }
  }

  return edgeTypes;
}

/**
 * 获取边的类型
 */
export function getEdgeType(
  edge: RuntimeEdgeItemType,
  edgeTypes: Map<string, EdgeType>
): EdgeType | undefined {
  const edgeKey = `${edge.source}-${edge.target}-${edge.sourceHandle || 'default'}`;
  return edgeTypes.get(edgeKey);
}
