import { NodeInputKeyEnum, NodeOutputKeyEnum } from '../../core/workflow/constants';
import { FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from '../../core/workflow/node/constant';
import type { StoreEdgeItemType } from '../../core/workflow/type/edge';
import type { StoreNodeItemType } from '../../core/workflow/type/node';
import { UserConfigError } from '../error/utils';
import { getHandleId } from './reference';

/** 只有声明该分支配置的节点类型才会用输入值生成连接端口。 */
export const getWorkflowBranchInputKey = (nodeType: FlowNodeTypeEnum) => {
  switch (nodeType) {
    case FlowNodeTypeEnum.ifElseNode:
      return NodeInputKeyEnum.ifElseList;
    case FlowNodeTypeEnum.userSelect:
      return NodeInputKeyEnum.userSelectOptions;
    case FlowNodeTypeEnum.classifyQuestion:
      return NodeInputKeyEnum.agents;
  }
};

const legacySourceDirections = ['left', 'top', 'bottom'];
const legacyTargetDirections = ['right', 'top', 'bottom'];

/** 历史普通出口统一到右侧；分支和显式输出保留原名以匹配真实端口。 */
export const normalizeWorkflowSourceHandle = (
  handle: string,
  node: Pick<StoreNodeItemType, 'nodeId' | 'flowNodeType'> & {
    outputs: readonly Pick<StoreNodeItemType['outputs'][number], 'key' | 'type'>[];
  }
) => {
  const prefix = getHandleId(node.nodeId, 'source', '');
  if (!handle.startsWith(prefix)) return handle;

  const key = handle.slice(prefix.length);
  if (
    !legacySourceDirections.includes(key) ||
    getWorkflowBranchInputKey(node.flowNodeType) !== undefined ||
    node.outputs.some(
      (output) => output.type === FlowNodeOutputTypeEnum.source && output.key === key
    )
  ) {
    return handle;
  }
  return getHandleId(node.nodeId, 'source', 'right');
};

/** 历史普通入口统一到左侧，工具入口保持原值。 */
export const normalizeWorkflowTargetHandle = (handle: string, nodeId: string) => {
  const prefix = getHandleId(nodeId, 'target', '');
  return handle.startsWith(prefix) && legacyTargetDirections.includes(handle.slice(prefix.length))
    ? getHandleId(nodeId, 'target', 'left')
    : handle;
};

/** 清理已有版本中的悬挂边，供编辑和复制历史数据时使用。 */
export const filterWorkflowEdgesWithExistingNodes = ({
  nodes,
  edges
}: {
  nodes: readonly Pick<StoreNodeItemType, 'nodeId'>[];
  edges: readonly StoreEdgeItemType[];
}) => {
  const nodeIds = new Set(nodes.map(({ nodeId }) => nodeId));
  return edges.filter(({ source, target }) => nodeIds.has(source) && nodeIds.has(target));
};

/** 编辑和保存共用的结构检查。孤立节点和缺失父节点保留给业务诊断。 */
export const assertWorkflowDocumentStructure = ({
  nodes,
  edges
}: {
  nodes: readonly Pick<StoreNodeItemType, 'nodeId' | 'parentNodeId'>[];
  edges: readonly Pick<StoreEdgeItemType, 'source' | 'target'>[];
}): void => {
  const parentByNodeId = new Map<string, string | undefined>();
  for (const { nodeId, parentNodeId } of nodes) {
    if (parentByNodeId.has(nodeId))
      throw new UserConfigError(`Duplicate workflow node id: ${nodeId}`);
    parentByNodeId.set(nodeId, parentNodeId);
  }

  // 父链独立于执行边，允许草稿保存尚未连通的流程。
  const checked = new Set<string>();
  for (const [nodeId, parentId] of parentByNodeId) {
    if (!parentId || checked.has(nodeId)) continue;

    const chain = new Set<string>();
    let currentId: string | undefined = nodeId;
    while (currentId && !checked.has(currentId)) {
      if (chain.has(currentId)) throw new UserConfigError(`Circular workflow parent: ${currentId}`);
      chain.add(currentId);
      currentId = parentByNodeId.get(currentId);
    }
    chain.forEach((id) => checked.add(id));
  }

  for (const { source, target } of edges) {
    if (!parentByNodeId.has(source) || !parentByNodeId.has(target)) {
      throw new UserConfigError(`Workflow edge references a missing node: ${source} -> ${target}`);
    }
  }
};

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
