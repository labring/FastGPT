import { filterGPTMessageByMaxContext } from '../../../../ai/llm/utils';
import type {
  ChatCompletionToolMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/type';
import { responseWriteController } from '../../../../../common/response';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { runWorkflow } from '../../index';
import type { DispatchToolModuleProps, RunToolResponse, ToolNodeItemType } from './type';
import json5 from 'json5';
import type { DispatchFlowResponse } from '../../type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type { AIChatItemType } from '@fastgpt/global/core/chat/type';
import { formatToolResponse, initToolCallEdges, initToolNodes } from './utils';
import { computedMaxToken } from '../../../../ai/utils';
import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { createLLMResponse } from '../../../../ai/llm/request';
import { toolValueTypeList, valueTypeJsonSchemaMap } from '@fastgpt/global/core/workflow/constants';

type ToolRunResponseType = {
  toolRunResponse?: DispatchFlowResponse;
  toolMsgParams: ChatCompletionToolMessageParam;
}[];

/* 
  调用思路：
  先Check 是否是交互节点触发
    
  交互模式：
  1. 从缓存中获取工作流运行数据
  2. 运行工作流
  3. 检测是否有停止信号或交互响应
    - 无：汇总结果，递归运行工具
    - 有：缓存结果，结束调用
  
  非交互模式：
  1. 组合 tools
  2. 过滤 messages
  3. Load request llm messages: system prompt, histories, human question, （assistant responses, tool responses, assistant responses....)
  4. 请求 LLM 获取结果
    
    - 有工具调用
      1. 批量运行工具的工作流，获取结果（工作流原生结果，工具执行结果）
      2. 合并递归中，所有工具的原生运行结果
      3. 组合 assistants tool 响应
      4. 组合本次 request 和 llm response 的 messages，并计算出消耗的 tokens
      5. 组合本次 request、llm response 和 tool response 结果
      6. 组合本次的 assistant responses: history assistant + tool assistant + tool child assistant
      7. 判断是否还有停止信号或交互响应
        - 无：递归运行工具
        - 有：缓存结果，结束调用
    - 无工具调用
      1. 汇总结果，递归运行工具
      2. 计算 completeMessages 和 tokens 后返回。

  交互节点额外缓存结果包括：
    1. 入口的节点 id
    2. toolCallId: 本次工具调用的 ID，可以找到是调用了哪个工具，入口并不会记录工具的 id
    3. messages：本次递归中，assistants responses 和 tool responses
*/

export const runToolCall = async (
  props: DispatchToolModuleProps & {
    maxRunToolTimes: number;
  },
  response?: RunToolResponse
): Promise<RunToolResponse> => {
  const {
    messages,
    toolNodes,
    toolModel,
    maxRunToolTimes,
    interactiveEntryToolParams,
    ...workflowProps
  } = props;
  let {
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

  if (maxRunToolTimes <= 0 && response) {
    return response;
  }

  // Interactive
  if (interactiveEntryToolParams) {
    initToolNodes(runtimeNodes, interactiveEntryToolParams.entryNodeIds);
    initToolCallEdges(runtimeEdges, interactiveEntryToolParams.entryNodeIds);

    // Run entry tool
    const toolRunResponse = await runWorkflow({
      ...workflowProps,
      usageId: undefined,
      isToolCall: true
    });
    const stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);

    // Response to frontend
    workflowStreamResponse?.({
      event: SseResponseEventEnum.toolResponse,
      data: {
        tool: {
          id: interactiveEntryToolParams.toolCallId,
          toolName: '',
          toolAvatar: '',
          params: '',
          response: sliceStrStartEnd(stringToolResponse, 5000, 5000)
        }
      }
    });

    // Check stop signal
    const hasStopSignal = toolRunResponse.flowResponses?.some((item) => item.toolStop);
    // Check interactive response(Only 1 interaction is reserved)
    const workflowInteractiveResponse = toolRunResponse.workflowInteractiveResponse;

    const requestMessages = [
      ...messages,
      ...interactiveEntryToolParams.memoryMessages.map((item) =>
        item.role === 'tool' && item.tool_call_id === interactiveEntryToolParams.toolCallId
          ? {
              ...item,
              content: stringToolResponse
            }
          : item
      )
    ];

    if (hasStopSignal || workflowInteractiveResponse) {
      // Get interactive tool data
      const toolWorkflowInteractiveResponse: WorkflowInteractiveResponseType | undefined =
        workflowInteractiveResponse
          ? {
              ...workflowInteractiveResponse,
              toolParams: {
                entryNodeIds: workflowInteractiveResponse.entryNodeIds,
                toolCallId: interactiveEntryToolParams.toolCallId,
                memoryMessages: interactiveEntryToolParams.memoryMessages
              }
            }
          : undefined;

      return {
        dispatchFlowResponse: [toolRunResponse],
        toolCallInputTokens: 0,
        toolCallOutputTokens: 0,
        completeMessages: requestMessages,
        assistantResponses: toolRunResponse.assistantResponses,
        runTimes: toolRunResponse.runTimes,
        toolWorkflowInteractiveResponse
      };
    }

    return runToolCall(
      {
        ...props,
        interactiveEntryToolParams: undefined,
        maxRunToolTimes: maxRunToolTimes - 1,
        // Rewrite toolCall messages
        messages: requestMessages
      },
      {
        dispatchFlowResponse: [toolRunResponse],
        toolCallInputTokens: 0,
        toolCallOutputTokens: 0,
        assistantResponses: toolRunResponse.assistantResponses,
        runTimes: toolRunResponse.runTimes
      }
    );
  }

  // ------------------------------------------------------------

  const assistantResponses = response?.assistantResponses || [];

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

  const max_tokens = computedMaxToken({
    model: toolModel,
    maxToken,
    min: 100
  });

  // Filter histories by maxToken
  const filterMessages = (
    await filterGPTMessageByMaxContext({
      messages,
      maxContext: toolModel.maxContext - (max_tokens || 0) // filter token. not response maxToken
    })
  ).map((item) => {
    if (item.role === 'assistant' && item.tool_calls) {
      return {
        ...item,
        tool_calls: item.tool_calls.map((tool) => ({
          id: tool.id,
          type: tool.type,
          function: tool.function
        }))
      };
    }
    return item;
  });

  const write = res ? responseWriteController({ res, readStream: stream }) : undefined;

  let {
    reasoningText: reasoningContent,
    answerText: answer,
    toolCalls = [],
    finish_reason,
    usage,
    getEmptyResponseTip,
    assistantMessage,
    completeMessages
  } = await createLLMResponse({
    body: {
      model: toolModel.model,
      stream,
      messages: filterMessages,
      tool_choice: 'auto',
      toolCallMode: toolModel.toolChoice ? 'toolChoice' : 'prompt',
      tools,
      parallel_tool_calls: true,
      temperature,
      max_tokens,
      top_p: aiChatTopP,
      stop: aiChatStopSign,
      response_format: {
        type: aiChatResponseFormat as any,
        json_schema: aiChatJsonSchema
      },
      retainDatasetCite,
      useVision: aiChatVision,
      requestOrigin
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
    }
  });

  if (!answer && !reasoningContent && !toolCalls.length) {
    return Promise.reject(getEmptyResponseTip());
  }

  /* Run the selected tool by LLM.
    Since only reference parameters are passed, if the same tool is run in parallel, it will get the same run parameters
  */
  const toolsRunResponse: ToolRunResponseType = [];
  for await (const tool of toolCalls) {
    try {
      const toolNode = toolNodesMap.get(tool.function?.name);

      if (!toolNode) continue;

      const startParams = (() => {
        try {
          return json5.parse(tool.function.arguments);
        } catch (error) {
          return {};
        }
      })();

      initToolNodes(runtimeNodes, [toolNode.nodeId], startParams);
      const toolRunResponse = await runWorkflow({
        ...workflowProps,
        usageId: undefined,
        isToolCall: true
      });

      const stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);

      const toolMsgParams: ChatCompletionToolMessageParam = {
        tool_call_id: tool.id,
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        name: tool.function.name,
        content: stringToolResponse
      };

      workflowStreamResponse?.({
        event: SseResponseEventEnum.toolResponse,
        data: {
          tool: {
            id: tool.id,
            toolName: '',
            toolAvatar: '',
            params: '',
            response: sliceStrStartEnd(stringToolResponse, 5000, 5000)
          }
        }
      });

      toolsRunResponse.push({
        toolRunResponse,
        toolMsgParams
      });
    } catch (error) {
      const err = getErrText(error);
      workflowStreamResponse?.({
        event: SseResponseEventEnum.toolResponse,
        data: {
          tool: {
            id: tool.id,
            toolName: '',
            toolAvatar: '',
            params: '',
            response: sliceStrStartEnd(err, 5000, 5000)
          }
        }
      });

      toolsRunResponse.push({
        toolRunResponse: undefined,
        toolMsgParams: {
          tool_call_id: tool.id,
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          name: tool.function.name,
          content: sliceStrStartEnd(err, 5000, 5000)
        }
      });
    }
  }

  const flatToolsResponseData = toolsRunResponse
    .map((item) => item.toolRunResponse)
    .flat()
    .filter(Boolean) as DispatchFlowResponse[];
  // concat tool responses
  const dispatchFlowResponse = response
    ? response.dispatchFlowResponse.concat(flatToolsResponseData)
    : flatToolsResponseData;

  const inputTokens = response
    ? response.toolCallInputTokens + usage.inputTokens
    : usage.inputTokens;
  const outputTokens = response
    ? response.toolCallOutputTokens + usage.outputTokens
    : usage.outputTokens;

  if (toolCalls.length > 0) {
    /* 
      ...
      user
      assistant: tool data
      tool: tool response
    */
    const nextRequestMessages: ChatCompletionMessageParam[] = [
      ...completeMessages,
      ...toolsRunResponse.map((item) => item?.toolMsgParams)
    ];

    /* 
      Get tool node assistant response
      - history assistant
      - current tool assistant
      - tool child assistant
    */
    const toolNodeAssistant = GPTMessages2Chats({
      messages: [...assistantMessage, ...toolsRunResponse.map((item) => item?.toolMsgParams)],
      getToolInfo: (id) => {
        const toolNode = toolNodesMap.get(id);
        return {
          name: toolNode?.name || '',
          avatar: toolNode?.avatar || ''
        };
      }
    })[0] as AIChatItemType;
    const toolChildAssistants = flatToolsResponseData
      .map((item) => item.assistantResponses)
      .flat()
      .filter((item) => item.type !== ChatItemValueTypeEnum.interactive); // 交互节点留着下次记录
    const concatAssistantResponses = [
      ...assistantResponses,
      ...toolNodeAssistant.value,
      ...toolChildAssistants
    ];

    const runTimes =
      (response?.runTimes || 0) +
      flatToolsResponseData.reduce((sum, item) => sum + item.runTimes, 0);

    // Check stop signal
    const hasStopSignal = flatToolsResponseData.some(
      (item) => !!item.flowResponses?.find((item) => item.toolStop)
    );
    // Check interactive response(Only 1 interaction is reserved)
    const workflowInteractiveResponseItem = toolsRunResponse.find(
      (item) => item.toolRunResponse?.workflowInteractiveResponse
    );
    if (hasStopSignal || workflowInteractiveResponseItem) {
      // Get interactive tool data
      const workflowInteractiveResponse =
        workflowInteractiveResponseItem?.toolRunResponse?.workflowInteractiveResponse;

      // Flashback traverses completeMessages, intercepting messages that know the first user
      const firstUserIndex = nextRequestMessages.findLastIndex((item) => item.role === 'user');
      const newMessages = nextRequestMessages.slice(firstUserIndex + 1);

      const toolWorkflowInteractiveResponse: WorkflowInteractiveResponseType | undefined =
        workflowInteractiveResponse
          ? {
              ...workflowInteractiveResponse,
              toolParams: {
                entryNodeIds: workflowInteractiveResponse.entryNodeIds,
                toolCallId: workflowInteractiveResponseItem?.toolMsgParams.tool_call_id,
                memoryMessages: newMessages
              }
            }
          : undefined;

      return {
        dispatchFlowResponse,
        toolCallInputTokens: inputTokens,
        toolCallOutputTokens: outputTokens,
        completeMessages: nextRequestMessages,
        assistantResponses: concatAssistantResponses,
        toolWorkflowInteractiveResponse,
        runTimes,
        finish_reason
      };
    }

    return runToolCall(
      {
        ...props,
        maxRunToolTimes: maxRunToolTimes - 1,
        messages: nextRequestMessages
      },
      {
        dispatchFlowResponse,
        toolCallInputTokens: inputTokens,
        toolCallOutputTokens: outputTokens,
        assistantResponses: concatAssistantResponses,
        runTimes,
        finish_reason
      }
    );
  } else {
    // concat tool assistant
    const toolNodeAssistant = GPTMessages2Chats({
      messages: assistantMessage
    })[0] as AIChatItemType;

    return {
      dispatchFlowResponse: response?.dispatchFlowResponse || [],
      toolCallInputTokens: inputTokens,
      toolCallOutputTokens: outputTokens,

      completeMessages,
      assistantResponses: [...assistantResponses, ...toolNodeAssistant.value],
      runTimes: (response?.runTimes || 0) + 1,
      finish_reason
    };
  }
};
