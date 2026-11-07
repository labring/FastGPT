import { NodeOutputKeyEnum } from '../../core/workflow/constants';
import { FlowNodeTypeEnum } from '../../core/workflow/node/constant';

type ConnectionEdge = {
  source?: string;
  target: string;
  targetHandle?: string | null;
};

/**
 * 检查加入候选连线后的工具流程边界，不修改已有图。
 * 普通边连通的节点属于同一流程，selectedTools 边进入独立的工具流程。
 * 工具流程可向未归属节点延伸，外部节点不能反向接入工具内部；不同工具流程不能互通。
 * 同时禁止混入主流程入口或回连任一调用祖先。
 */
export const isToolWorkflowConnectionAllowed = ({
  source,
  target,
  isToolConnection,
  edges,
  getNodeById
}: {
  source: string;
  target: string;
  isToolConnection: boolean;
  edges: ConnectionEdge[];
  getNodeById: (nodeId: string) => { flowNodeType: FlowNodeTypeEnum } | undefined;
}) => {
  const candidate: ConnectionEdge = {
    source,
    target,
    targetHandle: isToolConnection ? NodeOutputKeyEnum.selectedTools : undefined
  };
  const neighbors = new Map<string, string[]>();
  const normalTargets = new Map<string, string[]>();
  const toolTargets = new Map<string, string[]>();
  const toolRoots = new Set<string>();
  for (const edge of [...edges, candidate]) {
    if (edge.targetHandle === NodeOutputKeyEnum.selectedTools) {
      toolRoots.add(edge.target);
      if (edge.source) {
        toolTargets.set(edge.source, [...(toolTargets.get(edge.source) ?? []), edge.target]);
      }
    } else if (edge.source) {
      normalTargets.set(edge.source, [...(normalTargets.get(edge.source) ?? []), edge.target]);
      neighbors.set(edge.source, [...(neighbors.get(edge.source) ?? []), edge.target]);
      neighbors.set(edge.target, [...(neighbors.get(edge.target) ?? []), edge.source]);
    }
  }

  // 工具内部节点必须能从工具入口沿普通边正向到达，不能靠一条外部入边取得归属。
  if (!isToolConnection) {
    const toolNodeIds = new Set<string>();
    const pending = [...toolRoots];
    while (pending.length) {
      const nodeId = pending.pop()!;
      if (toolNodeIds.has(nodeId)) continue;
      toolNodeIds.add(nodeId);
      pending.push(...(normalTargets.get(nodeId) ?? []));
    }
    if (!toolNodeIds.has(source) && toolNodeIds.has(target)) return false;
  }

  // 用普通边的连通分量判断整段流程，避免通过尚未归属的中间节点绕过边界。
  const component = new Set<string>();
  const pending = [target];
  while (pending.length) {
    const nodeId = pending.pop()!;
    if (component.has(nodeId)) continue;
    component.add(nodeId);
    pending.push(...(neighbors.get(nodeId) ?? []));
  }
  const roots = [...component].filter((nodeId) => toolRoots.has(nodeId));
  if (roots.length === 0) return true;
  if (roots.length > 1) return false;
  if (
    [...component].some((nodeId) => {
      const type = getNodeById(nodeId)?.flowNodeType;
      return type === FlowNodeTypeEnum.workflowStart || type === FlowNodeTypeEnum.pluginInput;
    })
  ) {
    return false;
  }

  // 工具调用边只向子流程遍历；若能返回当前流程，就把调用者与其子流程接到了一层。
  const visited = new Set(component);
  pending.push(...[...component].flatMap((nodeId) => toolTargets.get(nodeId) ?? []));
  while (pending.length) {
    const nodeId = pending.pop()!;
    if (component.has(nodeId)) return false;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    pending.push(...(neighbors.get(nodeId) ?? []), ...(toolTargets.get(nodeId) ?? []));
  }
  return true;
};
