import type {
  ChatCompletionToolMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/type';
import { responseWriteController } from '../../../../../common/response';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { runWorkflow } from '../../index';
import type { DispatchAgentModuleProps, ToolNodeItemType } from './type';
import json5 from 'json5';
import type { DispatchFlowResponse } from '../../type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type { AIChatItemType, AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { formatToolResponse, initToolCallEdges, initToolNodes } from '../utils';
import { computedMaxToken } from '../../../../ai/utils';
import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { createLLMResponse } from '../../../../ai/llm/request';
import { toolValueTypeList, valueTypeJsonSchemaMap } from '@fastgpt/global/core/workflow/constants';
import type { RunAgentResponse } from './type';

type ToolRunResponseType = {
  toolRunResponse?: DispatchFlowResponse;
  toolMsgParams: ChatCompletionToolMessageParam;
}[];

export const runAgentCall = async (props: DispatchAgentModuleProps): Promise<RunAgentResponse> => {
  const {
    messages,
    toolNodes,
    agentModel,
    maxRunAgentTimes,
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
    runningUserInfo,
    params: {
      temperature,
      maxToken,
      aiChatVision,
      aiChatTopP,
      aiChatStopSign,
      aiChatResponseFormat,
      aiChatJsonSchema,
      aiChatReasoning
      // subConfig,
      // planConfig,
      // modelConfig
    }
  } = workflowProps;

  const toolNodesMap = new Map<string, ToolNodeItemType>(
    toolNodes.map((item) => [item.nodeId, item])
  );
  const tools: ChatCompletionTool[] = [
    // ...createBuiltinTools(),
    ...createToolFromToolNodes(toolNodes)
  ];

  const max_tokens = computedMaxToken({
    model: agentModel,
    maxToken,
    min: 100
  });

  const write = res ? responseWriteController({ res, readStream: stream }) : undefined;

  // Interactive mode 状态
  let currentInteractiveParams = interactiveEntryToolParams;

  // 统计信息
  const allToolsRunResponse: ToolRunResponseType = [];
  const assistantResponses: AIChatItemValueItemType[] = [];
  const dispatchFlowResponse: DispatchFlowResponse[] = [];
  let agentWorkflowInteractiveResponse: WorkflowInteractiveResponseType | undefined;
  let allCompleteMessages: ChatCompletionMessageParam[] = messages;
  let finish_reason: CompletionFinishReason = null;
  let currRunAgentTimes: number = maxRunAgentTimes;
  let inputTokens: number = 0;
  let outputTokens: number = 0;
  let runTimes: number = 0;

  while (currRunAgentTimes > 0) {
    const currToolsRunResponse: ToolRunResponseType = [];

    // Interactive mode handling
    if (currentInteractiveParams) {
      initToolNodes(runtimeNodes, currentInteractiveParams.entryNodeIds);
      initToolCallEdges(runtimeEdges, currentInteractiveParams.entryNodeIds);

      const toolRunResponse = await runWorkflow({
        ...workflowProps,
        isToolCall: true
      });

      const stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);

      workflowStreamResponse?.({
        event: SseResponseEventEnum.toolResponse,
        data: {
          tool: {
            id: currentInteractiveParams.toolCallId,
            toolName: '',
            toolAvatar: '',
            params: '',
            response: sliceStrStartEnd(stringToolResponse, 5000, 5000)
          }
        }
      });

      const hasStopSignal = toolRunResponse.flowResponses?.some((item) => item.toolStop);
      const workflowInteractiveResponse = toolRunResponse.workflowInteractiveResponse;

      allCompleteMessages.push(
        ...currentInteractiveParams.memoryMessages.map((item) =>
          item.role === 'tool' && item.tool_call_id === currentInteractiveParams?.toolCallId
            ? { ...item, content: stringToolResponse }
            : item
        )
      );

      // 累积 interactive 工具的结果
      dispatchFlowResponse.push(toolRunResponse);
      assistantResponses.push(...toolRunResponse.assistantResponses);
      runTimes += toolRunResponse.runTimes;

      if (hasStopSignal || workflowInteractiveResponse) {
        if (workflowInteractiveResponse) {
          agentWorkflowInteractiveResponse = {
            ...workflowInteractiveResponse,
            toolParams: {
              entryNodeIds: workflowInteractiveResponse.entryNodeIds,
              toolCallId: currentInteractiveParams?.toolCallId || '',
              memoryMessages: currentInteractiveParams?.memoryMessages || []
            }
          };
        }
        break;
      }

      currentInteractiveParams = undefined;
      currRunAgentTimes--;
      continue;
    }

    // ------------------------------------------------------------

    // TODO: Context agent compression

    let {
      reasoningText: reasoningContent,
      answerText: answer,
      toolCalls = [],
      finish_reason: currFinishReason,
      usage,
      getEmptyResponseTip,
      assistantMessage,
      completeMessages
    } = await createLLMResponse({
      body: {
        model: agentModel.model,
        stream,
        messages: allCompleteMessages,
        tool_choice: 'auto',
        toolCallMode: agentModel.toolChoice ? 'toolChoice' : 'prompt',
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
      userKey: externalProvider.openaiAccount,
      isAborted: () => res?.closed,
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
        if (!toolNode) return;
        workflowStreamResponse?.({
          event: SseResponseEventEnum.toolCall,
          data: {
            tool: {
              id: call.id,
              toolName: toolNode?.name || call.function.name,
              toolAvatar: toolNode?.avatar || '',
              functionName: call.function.name,
              params: call.function.arguments ?? '',
              response: ''
            }
          }
        });
      }
    });

    if (!answer && !reasoningContent && !toolCalls.length) {
      return Promise.reject(getEmptyResponseTip());
    }

    for await (const tool of toolCalls) {
      const toolNode = toolNodesMap.get(tool.function?.name);
      let toolRunResponse, stringToolResponse;

      try {
        if (!toolNode) continue;

        const startParams = (() => {
          try {
            return json5.parse(tool.function.arguments);
          } catch {
            return {};
          }
        })();

        initToolNodes(runtimeNodes, [toolNode.nodeId], startParams);

        // TODO: 需要传递 sub apps config参数, 运行 sub agent 获取结果. 并考虑计费问题
        toolRunResponse = await runWorkflow({
          ...workflowProps,
          isToolCall: true
        });

        stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);
      } catch (error) {
        stringToolResponse = getErrText(error);
      }
      workflowStreamResponse?.({
        event: SseResponseEventEnum.toolResponse,
        data: {
          tool: {
            id: tool.id,
            toolName: '',
            toolAvatar: '',
            params: '',
            response: sliceStrStartEnd(stringToolResponse || '', 5000, 5000)
          }
        }
      });

      currToolsRunResponse.push({
        toolRunResponse,
        toolMsgParams: {
          tool_call_id: tool.id,
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          name: tool.function.name,
          content: sliceStrStartEnd(stringToolResponse || '', 5000, 5000)
        }
      });
    }

    const currFlatToolsResponseData = currToolsRunResponse
      .flatMap((item) => item.toolRunResponse ?? [])
      .filter(Boolean);

    // 累积工具调用的响应结果
    allToolsRunResponse.push(...currToolsRunResponse);
    dispatchFlowResponse.push(...currFlatToolsResponseData);
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    finish_reason = currFinishReason;

    // handle sub apps
    if (toolCalls.length > 0) {
      allCompleteMessages = [
        ...completeMessages,
        ...currToolsRunResponse.map((item) => item?.toolMsgParams)
      ];

      const agentNodeAssistant = GPTMessages2Chats({
        messages: [...assistantMessage, ...currToolsRunResponse.map((item) => item?.toolMsgParams)],
        getToolInfo: (id) => {
          const toolNode = toolNodesMap.get(id);
          return {
            name: toolNode?.name || '',
            avatar: toolNode?.avatar || ''
          };
        }
      })[0] as AIChatItemType;
      const agentChildAssistants = currFlatToolsResponseData
        .map((item) => item.assistantResponses)
        .flat()
        .filter((item) => item.type !== ChatItemValueTypeEnum.interactive); // 交互节点留着下次记录

      assistantResponses.push(...agentNodeAssistant.value, ...agentChildAssistants);

      runTimes += currFlatToolsResponseData.reduce((sum, { runTimes }) => sum + runTimes, 0);

      const hasStopSignal = currFlatToolsResponseData.some((item) =>
        item.flowResponses?.some((flow) => flow.toolStop)
      );
      // Check interactive response(Only 1 interaction is reserved)
      const workflowInteractiveResponseItem = currToolsRunResponse.find(
        (item) => item.toolRunResponse?.workflowInteractiveResponse
      );

      if (hasStopSignal || workflowInteractiveResponseItem) {
        // Get interactive tool data
        const workflowInteractiveResponse =
          workflowInteractiveResponseItem?.toolRunResponse?.workflowInteractiveResponse;

        // Flashback traverses completeMessages, intercepting messages that know the first user
        const firstUserIndex = allCompleteMessages.findLastIndex((item) => item.role === 'user');
        const newMessages = allCompleteMessages.slice(firstUserIndex + 1);

        if (workflowInteractiveResponse) {
          agentWorkflowInteractiveResponse = {
            ...workflowInteractiveResponse,
            toolParams: {
              entryNodeIds: workflowInteractiveResponse.entryNodeIds,
              toolCallId: workflowInteractiveResponseItem?.toolMsgParams.tool_call_id,
              memoryMessages: newMessages
            }
          };
        }

        break;
      }

      currRunAgentTimes--;
    } else {
      const agentNodeAssistant = GPTMessages2Chats({
        messages: assistantMessage
      })[0] as AIChatItemType;
      assistantResponses.push(...agentNodeAssistant.value);
      runTimes++;

      break;
    }
  }

  return {
    dispatchFlowResponse,
    agentCallInputTokens: inputTokens,
    agentCallOutputTokens: outputTokens,
    completeMessages: allCompleteMessages,
    assistantResponses,
    agentWorkflowInteractiveResponse,
    runTimes,
    finish_reason
  };
};

const createToolFromToolNodes = (toolNodes: ToolNodeItemType[]): ChatCompletionTool[] => {
  return toolNodes.map((item: ToolNodeItemType) => {
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

    const properties: Record<string, any> = {};
    item.toolParams.forEach((param) => {
      const jsonSchema = param.valueType
        ? valueTypeJsonSchemaMap[param.valueType] || toolValueTypeList[0].jsonSchema
        : toolValueTypeList[0].jsonSchema;

      properties[param.key] = {
        ...jsonSchema,
        description: param.toolDescription || '',
        enum: param.enum?.split('\n').filter(Boolean) || undefined
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
          required: item.toolParams.filter((param) => param.required).map((param) => param.key)
        }
      }
    };
  });
};

// const createBuiltinTools = (): ChatCompletionTool[] => {
//   return [
//     {
//       type: 'function',
//       function: {
//         name: 'plan_agent',
//         description: '',
//         parameters: {
//           type: 'object',
//           properties: {
//             instruction: {
//               type: 'string',
//               description: ''
//             }
//           },
//           required: ['instruction']
//         }
//       }
//     }
//   ];
// };
