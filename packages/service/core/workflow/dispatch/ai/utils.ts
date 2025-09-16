import {
  replaceVariable,
  sliceJsonStr,
  sliceStrStartEnd
} from '@fastgpt/global/common/string/tools';
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
import type { ToolNodeItemType } from './tool/type';
import json5 from 'json5';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';

// Assistant process
export const filterToolResponseToPreview = (response: AIChatItemValueItemType[]) => {
  return response.map((item) => {
    if (item.tools) {
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

export const filterMemoryMessages = (messages: ChatCompletionMessageParam[]) => {
  return messages.filter((item) => item.role !== ChatCompletionRequestMessageRoleEnum.System);
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
      if (startParams) {
        node.inputs = updateToolInputValue({ params: startParams, inputs: node.inputs });
      }
    }
  });
};

/*
  Tool call, auth add file prompt to question。
  Guide the LLM to call tool.
*/
export const toolCallMessagesAdapt = ({
  userInput,
  skip
}: {
  userInput: UserChatItemValueItemType[];
  skip?: boolean;
}): UserChatItemValueItemType[] => {
  const getMultiplePrompt = (obj: { fileCount: number; imgCount: number; question: string }) => {
    const prompt = `Number of session file inputs：
  Document：{{fileCount}}
  Image：{{imgCount}}
  ------
  {{question}}`;
    return replaceVariable(prompt, obj);
  };

  if (skip) return userInput;

  const files = userInput.filter((item) => item.file);

  if (files.length > 0) {
    const filesCount = files.filter((file) => file.file?.type === 'file').length;
    const imgCount = files.filter((file) => file.file?.type === 'image').length;

    if (userInput.some((item) => item.text)) {
      return userInput.map((item) => {
        if (item.text) {
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
    .map((nodeId) => nodeMap.get(nodeId)!)
    .filter((tool) => Boolean(tool))
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

export const parseToolArgs = <T = Record<string, any>>(toolArgs: string) => {
  try {
    return json5.parse(sliceJsonStr(toolArgs)) as T;
  } catch {
    return;
  }
};
