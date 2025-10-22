import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

export const initToolNodes = (
  nodes: RuntimeNodeItemType[],
  entryNodeIds: string[],
  startParams?: Record<string, any>
) => {
  const updateToolInputValue = ({
    params,
    inputs
  }: {
    params: Record<string, any>;
    inputs: FlowNodeInputItemType[];
  }) => {
    return inputs.map((input) => ({
      ...input,
      value: params[input.key] ?? input.value
    }));
  };

  nodes.forEach((node) => {
    if (entryNodeIds.includes(node.nodeId)) {
      node.isEntry = true;
      node.isStart = true;
      if (startParams) {
        node.inputs = updateToolInputValue({ params: startParams, inputs: node.inputs });
      }
    } else {
      node.isStart = false;
    }
  });
};
// 在原参上改变值，不修改原对象，tool workflow 中，使用的还是原对象
export const initToolCallEdges = (edges: RuntimeEdgeItemType[], entryNodeIds: string[]) => {
  edges.forEach((edge) => {
    if (entryNodeIds.includes(edge.target)) {
      edge.status = 'active';
    }
  });
};
