import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { getMCPToolNodes } from '@fastgpt/global/core/app/mcpTools/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export const updateToolInputValue = ({
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

export const filterToolResponseToPreview = (response: AIChatItemValueItemType[]) => {
  return response.map((item) => {
    if (item.type === ChatItemValueTypeEnum.tool) {
      const formatTools = item.tools?.map((tool) => {
        return {
          ...tool,
          response: sliceStrStartEnd(tool.response, 500, 500)
        };
      });
      return {
        ...item,
        tools: formatTools
      };
    }

    return item;
  });
};

export const formatToolResponse = (toolResponses: any) => {
  if (typeof toolResponses === 'object') {
    return JSON.stringify(toolResponses, null, 2);
  }

  return toolResponses ? String(toolResponses) : 'none';
};

// 在原参上改变值，不修改原对象，tool workflow 中，使用的还是原对象
export const initToolCallEdges = (edges: RuntimeEdgeItemType[], entryNodeIds: string[]) => {
  edges.forEach((edge) => {
    if (entryNodeIds.includes(edge.target)) {
      edge.status = 'active';
    }
  });
};

export const initToolNodes = (
  nodes: RuntimeNodeItemType[],
  entryNodeIds: string[],
  startParams?: Record<string, any>
) => {
  nodes.forEach((node) => {
    if (entryNodeIds.includes(node.nodeId)) {
      node.isEntry = true;
      if (startParams) {
        node.inputs = updateToolInputValue({ params: startParams, inputs: node.inputs });
      }
    }
  });
};

export const formatRuntimeWorkFlow = (
  nodes: RuntimeNodeItemType[],
  edges: RuntimeEdgeItemType[]
) => {
  const newNodes = [...nodes];
  const newEdges = [...edges];

  const toolSetNodes = nodes.filter((node) => node.flowNodeType === FlowNodeTypeEnum.toolSet);

  if (toolSetNodes.length === 0) {
    return { runtimeNodes: nodes, runtimeEdges: edges };
  }

  const nodeIdsToRemove = new Set<string>();

  for (const toolSetNode of toolSetNodes) {
    nodeIdsToRemove.add(toolSetNode.nodeId);
    const toolList =
      toolSetNode.inputs.find((input) => input.key === 'toolSetData')?.value?.toolList || [];
    const url = toolSetNode.inputs.find((input) => input.key === 'toolSetData')?.value?.url;

    const incomingEdges = newEdges.filter((edge) => edge.target === toolSetNode.nodeId);

    for (const tool of toolList) {
      const newToolNodes = getMCPToolNodes({ tool, url });

      newNodes.push({ ...newToolNodes[0], name: `${toolSetNode.name} / ${tool.name}` });

      for (const inEdge of incomingEdges) {
        newEdges.push({
          source: inEdge.source,
          target: newToolNodes[0].nodeId,
          sourceHandle: inEdge.sourceHandle,
          targetHandle: 'selectedTools',
          status: inEdge.status
        });
      }
    }
  }

  const filteredNodes = newNodes.filter((node) => !nodeIdsToRemove.has(node.nodeId));
  const filteredEdges = newEdges.filter((edge) => !nodeIdsToRemove.has(edge.target));

  return { runtimeNodes: filteredNodes, runtimeEdges: filteredEdges };
};
