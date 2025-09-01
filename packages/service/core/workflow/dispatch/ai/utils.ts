import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import type {
  AIChatItemValueItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { McpToolDataType } from '@fastgpt/global/core/app/mcpTools/type';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import { getMultiplePrompt } from './tool/constants';
import type { ToolNodeItemType } from './tool/type';

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

/*
Tool call， auth add file prompt to question。
Guide the LLM to call tool.
*/
export const toolCallMessagesAdapt = ({
  userInput,
  skip
}: {
  userInput: UserChatItemValueItemType[];
  skip?: boolean;
}): UserChatItemValueItemType[] => {
  if (skip) return userInput;

  const files = userInput.filter((item) => item.type === 'file');

  if (files.length > 0) {
    const filesCount = files.filter((file) => file.file?.type === 'file').length;
    const imgCount = files.filter((file) => file.file?.type === 'image').length;

    if (userInput.some((item) => item.type === 'text')) {
      return userInput.map((item) => {
        if (item.type === 'text') {
          const text = item.text?.content || '';

          return {
            ...item,
            text: {
              content: getMultiplePrompt({ fileCount: filesCount, imgCount, question: text })
            }
          };
        }
        return item;
      });
    }

    // Every input is a file
    return [
      {
        type: ChatItemValueTypeEnum.text,
        text: {
          content: getMultiplePrompt({ fileCount: filesCount, imgCount, question: '' })
        }
      }
    ];
  }

  return userInput;
};

export const getToolNodesByIds = ({
  toolNodeIds,
  runtimeNodes
}: {
  toolNodeIds: string[];
  runtimeNodes: RuntimeNodeItemType[];
}): ToolNodeItemType[] => {
  const nodeMap = new Map(runtimeNodes.map((node) => [node.nodeId, node]));

  return toolNodeIds
    .map((nodeId) => nodeMap.get(nodeId))
    .filter((tool): tool is RuntimeNodeItemType => Boolean(tool))
    .map((tool) => {
      const toolParams: FlowNodeInputItemType[] = [];
      let jsonSchema: JSONSchemaInputType | undefined;

      for (const input of tool.inputs) {
        if (input.toolDescription) {
          toolParams.push(input);
        }

        if (input.key === NodeInputKeyEnum.toolData) {
          jsonSchema = (input.value as McpToolDataType).inputSchema;
        }
      }

      return {
        ...tool,
        toolParams,
        jsonSchema
      };
    });
};
