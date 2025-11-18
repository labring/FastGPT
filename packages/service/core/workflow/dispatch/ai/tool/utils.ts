<<<<<<< HEAD
/* 
  匹配 {{@toolId@}}，转化成: @name 的格式。
*/
export const parseSystemPrompt = ({
  systemPrompt,
  getSubAppInfo
}: {
  systemPrompt?: string;
  getSubAppInfo: (id: string) => {
    name: string;
    avatar: string;
    toolDescription: string;
  };
}): string => {
  if (!systemPrompt) return '';

  // Match pattern {{@toolId@}} and convert to @name format
  const pattern = /\{\{@([^@]+)@\}\}/g;

  const processedPrompt = systemPrompt.replace(pattern, (match, toolId) => {
    const toolInfo = getSubAppInfo(toolId);
    if (!toolInfo) {
      console.warn(`Tool not found for ID: ${toolId}`);
      return match; // Return original match if tool not found
    }

    return `@${toolInfo.name}`;
  });

<<<<<<<< HEAD:packages/service/core/workflow/dispatch/ai/tool/utils.ts
export const formatToolResponse = (toolResponses: any) => {
  if (typeof toolResponses === 'object') {
    return JSON.stringify(toolResponses, null, 2);
  }

  return toolResponses ? String(toolResponses) : 'none';
};

=======
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
>>>>>>> 757253617 (squash: compress all commits into one)
// 在原参上改变值，不修改原对象，tool workflow 中，使用的还是原对象
export const initToolCallEdges = (edges: RuntimeEdgeItemType[], entryNodeIds: string[]) => {
  edges.forEach((edge) => {
    if (entryNodeIds.includes(edge.target)) {
      edge.status = 'active';
    }
  });
};
<<<<<<< HEAD

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
========
  return processedPrompt;
>>>>>>>> 757253617 (squash: compress all commits into one):packages/service/core/workflow/dispatch/ai/agent/utils.ts
};
=======
>>>>>>> 757253617 (squash: compress all commits into one)
