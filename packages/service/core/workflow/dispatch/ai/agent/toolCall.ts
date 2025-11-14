import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { responseWriteController } from '../../../../../common/response';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { runWorkflow } from '../../index';
import type { DispatchToolModuleProps, RunToolResponse, ToolNodeItemType } from './type';
import type { DispatchFlowResponse } from '../../type';
import { chats2GPTMessages, GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { formatToolResponse, initToolCallEdges, initToolNodes } from './utils';
import { parseToolArgs } from '../../../../ai/utils';
import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { toolValueTypeList, valueTypeJsonSchemaMap } from '@fastgpt/global/core/workflow/constants';
import { runAgentCall } from '../../../../ai/llm/agentCall';

export const runToolCall = async (props: DispatchToolModuleProps): Promise<RunToolResponse> => {
  const { messages, toolNodes, toolModel, childrenInteractiveParams, ...workflowProps } = props;
  const {
    res,
    requestOrigin,
    runtimeNodes,
    runtimeEdges,
    stream,
    retainDatasetCite = true,
    externalProvider,
    workflowStreamResponse,
    params: {
      temperature,
      maxToken,
      aiChatVision,
      aiChatTopP,
      aiChatStopSign,
      aiChatResponseFormat,
      aiChatJsonSchema,
      aiChatReasoning
    }
  } = workflowProps;

  // 构建 tools 参数
  const toolNodesMap = new Map<string, ToolNodeItemType>();
  const tools: ChatCompletionTool[] = toolNodes.map((item) => {
    toolNodesMap.set(item.nodeId, item);
    if (item.jsonSchema) {
      return {
        type: 'function',
        function: {
          name: item.nodeId,
          description: item.intro || item.name,
          parameters: item.jsonSchema
        }
      };
    }

    const properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
        required?: boolean;
        items?: {
          type: string;
        };
      }
    > = {};
    item.toolParams.forEach((item) => {
      const jsonSchema = item.valueType
        ? valueTypeJsonSchemaMap[item.valueType] || toolValueTypeList[0].jsonSchema
        : toolValueTypeList[0].jsonSchema;

      properties[item.key] = {
        ...jsonSchema,
        description: item.toolDescription || '',
        enum: item.enum?.split('\n').filter(Boolean) || undefined
      };
    });

    return {
      type: 'function',
      function: {
        name: item.nodeId,
        description: item.toolDescription || item.intro || item.name,
        parameters: {
          type: 'object',
          properties,
          required: item.toolParams.filter((item) => item.required).map((item) => item.key)
        }
      }
    };
  });
  const getToolInfo = (name: string) => {
    const toolNode = toolNodesMap.get(name);
    return {
      name: toolNode?.name || '',
      avatar: toolNode?.avatar || ''
    };
  };

  // SSE 响应实例
  const write = res ? responseWriteController({ res, readStream: stream }) : undefined;
  // 工具响应原始值
  const toolRunResponses: DispatchFlowResponse[] = [];

  const {
    inputTokens,
    outputTokens,
    completeMessages,
    assistantMessages,
    interactiveResponse,
    finish_reason
  } = await runAgentCall({
    maxRunAgentTimes: 50,
    body: {
      messages,
      tools,
      model: toolModel.model,
      max_tokens: maxToken,
      stream,
      temperature,
      top_p: aiChatTopP,
      stop: aiChatStopSign,
      response_format: {
        type: aiChatResponseFormat,
        json_schema: aiChatJsonSchema
      },
      requestOrigin,
      retainDatasetCite,
      useVision: aiChatVision
    },
    isAborted: () => res?.closed,
    userKey: externalProvider.openaiAccount,
    onReasoning({ text }) {
      if (!aiChatReasoning) return;
      workflowStreamResponse?.({
        write,
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          reasoning_content: text
        })
      });
    },
    onStreaming({ text }) {
      workflowStreamResponse?.({
        write,
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text
        })
      });
    },
    onToolCall({ call }) {
      const toolNode = toolNodesMap.get(call.function.name);
      if (toolNode) {
        workflowStreamResponse?.({
          event: SseResponseEventEnum.toolCall,
          data: {
            tool: {
              id: call.id,
              toolName: toolNode.name,
              toolAvatar: toolNode.avatar,
              functionName: call.function.name,
              params: call.function.arguments ?? '',
              response: ''
            }
          }
        });
      }
    },
    onToolParam({ tool, params }) {
      workflowStreamResponse?.({
        write,
        event: SseResponseEventEnum.toolParams,
        data: {
          tool: {
            id: tool.id,
            toolName: '',
            toolAvatar: '',
            params,
            response: ''
          }
        }
      });
    },
    handleToolResponse: async ({ call, messages }) => {
      const toolNode = toolNodesMap.get(call.function?.name);

      if (!toolNode) {
        return {
          response: 'Call tool not found',
          assistantMessages: [],
          usages: [],
          interactive: undefined
        };
      }

      // Init tool params and run
      const startParams = parseToolArgs(call.function.arguments);
      initToolNodes(runtimeNodes, [toolNode.nodeId], startParams);
      initToolCallEdges(runtimeEdges, [toolNode.nodeId]);

      const toolRunResponse = await runWorkflow({
        ...workflowProps,
        runtimeNodes,
        usageId: undefined,
        isToolCall: true
      });

      // Format tool response
      const stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);

      workflowStreamResponse?.({
        event: SseResponseEventEnum.toolResponse,
        data: {
          tool: {
            id: call.id,
            toolName: '',
            toolAvatar: '',
            params: '',
            response: sliceStrStartEnd(stringToolResponse, 5000, 5000)
          }
        }
      });

      toolRunResponses.push(toolRunResponse);

      const assistantMessages = chats2GPTMessages({
        messages: [
          {
            obj: ChatRoleEnum.AI,
            value: toolRunResponse.assistantResponses
          }
        ],
        reserveId: false
      });

      return {
        response: stringToolResponse,
        assistantMessages,
        usages: toolRunResponse.flowUsages,
        interactive: toolRunResponse.workflowInteractiveResponse,
        stop: toolRunResponse.flowResponses?.some((item) => item.toolStop)
      };
    },
    childrenInteractiveParams,
    handleInteractiveTool: async ({ childrenResponse, toolParams }) => {
      initToolNodes(runtimeNodes, childrenResponse.entryNodeIds);
      initToolCallEdges(runtimeEdges, childrenResponse.entryNodeIds);

      const toolRunResponse = await runWorkflow({
        ...workflowProps,
        lastInteractive: childrenResponse,
        runtimeNodes,
        runtimeEdges,
        usageId: undefined,
        isToolCall: true
      });
      // console.dir(runtimeEdges, { depth: null });
      const stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);

      workflowStreamResponse?.({
        event: SseResponseEventEnum.toolResponse,
        data: {
          tool: {
            id: toolParams.toolCallId,
            toolName: '',
            toolAvatar: '',
            params: '',
            response: sliceStrStartEnd(stringToolResponse, 5000, 5000)
          }
        }
      });

      toolRunResponses.push(toolRunResponse);
      const assistantMessages = chats2GPTMessages({
        messages: [
          {
            obj: ChatRoleEnum.AI,
            value: toolRunResponse.assistantResponses
          }
        ],
        reserveId: false
      });

      return {
        response: stringToolResponse,
        assistantMessages,
        usages: toolRunResponse.flowUsages,
        interactive: toolRunResponse.workflowInteractiveResponse,
        stop: toolRunResponse.flowResponses?.some((item) => item.toolStop)
      };
    }
  });

  const assistantResponses = GPTMessages2Chats({
    messages: assistantMessages,
    reserveTool: true,
    getToolInfo
  })
    .map((item) => item.value as AIChatItemValueItemType[])
    .flat();

  return {
    toolDispatchFlowResponses: toolRunResponses,
    toolCallInputTokens: inputTokens,
    toolCallOutputTokens: outputTokens,
    completeMessages,
    assistantResponses,
    finish_reason,
    toolWorkflowInteractiveResponse: interactiveResponse
  };
};
