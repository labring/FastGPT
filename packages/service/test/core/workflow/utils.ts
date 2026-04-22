import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

// 辅助函数：创建测试节点
export const createNode = (
  nodeId: string,
  flowNodeType: FlowNodeTypeEnum
): RuntimeNodeItemType => ({
  nodeId,
  name: `Node ${nodeId}`,
  avatar: '',
  flowNodeType,
  showStatus: true,
  isEntry: false,
  inputs: [],
  outputs: []
});

// 辅助函数：创建测试边
export const createEdge = (
  source: string,
  target: string,
  status: 'waiting' | 'active' | 'skipped' = 'waiting',
  sourceHandle?: string,
  targetHandle?: string
): RuntimeEdgeItemType => ({
  source,
  target,
  status,
  sourceHandle: sourceHandle || `${source}-source-right`,
  targetHandle: targetHandle || `${target}-target-left`
});

export const setEdgeStatus = (
  edges: RuntimeEdgeItemType[],
  source: string,
  target: string,
  status: 'active' | 'waiting' | 'skipped'
) => {
  const edge = edges.find((e) => e.source === source && e.target === target);
  if (edge) {
    edge.status = status;
  }
};
