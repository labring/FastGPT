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
import { dispatchWorkFlow } from '../../index';
import type {
  DispatchAgentModuleProps,
  RunAgentResponse,
  ToolNodeItemType,
  AgentPlan
} from './type';
import json5 from 'json5';
import type { DispatchFlowResponse } from '../../type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type { AIChatItemType } from '@fastgpt/global/core/chat/type';
import { formatToolResponse, initToolCallEdges, initToolNodes } from '../agent/utils';
import { computedMaxToken } from '../../../../ai/utils';
import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { createLLMResponse } from '../../../../ai/llm/request';
import { toolValueTypeList, valueTypeJsonSchemaMap } from '@fastgpt/global/core/workflow/constants';
import { transferPlanAgent } from '../../../../ai/agents/plan';
// import { checkUsageLimit } from '../../../../../support/wallet/usage/controller';

type ToolRunResponseType = {
  toolRunResponse?: DispatchFlowResponse;
  toolMsgParams: ChatCompletionToolMessageParam;
}[];

/**
 * Agent Call 核心逻辑
 * 实现基于计划的智能体调用模式
 */
export const runAgentCall = async (
  props: DispatchAgentModuleProps & {
    maxRunAgentTimes: number;
  },
  response?: RunAgentResponse
): Promise<RunAgentResponse> => {
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
    }
  } = workflowProps;

  // 基本参数初始化
  let usageRecords: any[] = response?.dispatchFlowResponse || [];
  let plan: AgentPlan[] = [];
  let conversationMessages = [...messages];

  if (maxRunAgentTimes <= 0 && response) {
    return response;
  }

  // Interactive mode handling
  if (interactiveEntryToolParams) {
    return handleInteractiveMode({
      ...props,
      response,
      usageRecords,
      conversationMessages,
      originalProps: props
    });
  }

  // Agent主循环
  let currentRunTimes = maxRunAgentTimes;
  while (currentRunTimes > 0) {
    try {
      // 预检查（计费）
      await preCheck(runningUserInfo, agentModel);

      // Context检测和压缩
      const compressedMessages = await compressContext({
        messages: conversationMessages,
        agentModel,
        maxToken
      });

      // Call模型
      const llmResponse = await callModel({
        messages: compressedMessages,
        toolNodes,
        agentModel,
        temperature,
        maxToken,
        aiChatTopP,
        aiChatStopSign,
        aiChatResponseFormat,
        aiChatJsonSchema,
        aiChatVision,
        aiChatReasoning,
        retainDatasetCite,
        requestOrigin,
        externalProvider,
        workflowStreamResponse,
        stream,
        res
      });

      // Sub运行
      const subResults = await runSubWorkflows({
        toolCalls: llmResponse.toolCalls,
        toolNodes,
        runtimeNodes,
        runtimeEdges,
        workflowProps,
        workflowStreamResponse,
        agentModel,
        messages: compressedMessages
      });

      // Sub结果处理（plan特殊处理）
      const processedResults = await processSubResults({
        subResults,
        plan,
        llmResponse
      });

      // 合并messages和使用记录
      const mergedData = mergeMeessagesAndUsage({
        conversationMessages,
        usageRecords,
        llmResponse,
        processedResults,
        response
      });

      conversationMessages = mergedData.messages;
      usageRecords = mergedData.usageRecords;

      // 检查停止条件
      const shouldStop = checkStopConditions({
        subResults: processedResults.subResults,
        plan,
        llmResponse
      });

      if (shouldStop.stop) {
        return createFinalResponse({
          usageRecords,
          conversationMessages,
          assistantResponses: mergedData.assistantResponses,
          runTimes: mergedData.runTimes,
          inputTokens: mergedData.inputTokens,
          outputTokens: mergedData.outputTokens,
          finish_reason: llmResponse.finish_reason,
          interactiveResponse: shouldStop.interactiveResponse
        });
      }

      currentRunTimes--;
    } catch (error) {
      console.error('Agent call error:', error);
      // 错误处理逻辑
      break;
    }
  }

  // 返回assistantMessages和使用记录
  return createFinalResponse({
    usageRecords,
    conversationMessages,
    assistantResponses: response?.assistantResponses || [],
    runTimes: response?.runTimes || 0,
    inputTokens: response?.agentCallInputTokens || 0,
    outputTokens: response?.agentCallOutputTokens || 0,
    finish_reason: 'stop'
  });
};

// 预检查（计费）
async function preCheck(runningUserInfo: any, agentModel: any) {
  // 检查用户使用限制
  // TODO: Implement usage limit check
  // await checkUsageLimit({
  //   teamId: runningUserInfo.teamId,
  //   tmbId: runningUserInfo.tmbId,
  //   requestTokens: 1000 // 预估token消耗
  // });
}

// Context检测和压缩
async function compressContext({
  messages,
  agentModel,
  maxToken
}: {
  messages: ChatCompletionMessageParam[];
  agentModel: any;
  maxToken?: number;
}) {
  const max_tokens = computedMaxToken({
    model: agentModel,
    maxToken,
    min: 100
  });

  return await filterGPTMessageByMaxContext({
    messages,
    maxContext: agentModel.maxContext - (max_tokens || 0)
  });
}

// Call模型
async function callModel({
  messages,
  toolNodes,
  agentModel,
  temperature,
  maxToken,
  aiChatTopP,
  aiChatStopSign,
  aiChatResponseFormat,
  aiChatJsonSchema,
  aiChatVision,
  aiChatReasoning,
  retainDatasetCite,
  requestOrigin,
  externalProvider,
  workflowStreamResponse,
  stream,
  res
}: any) {
  const toolNodesMap = new Map<string, ToolNodeItemType>();
  const tools: ChatCompletionTool[] = toolNodes.map((item: ToolNodeItemType) => {
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

  // 添加 plan_agent 工具
  tools.push({
    type: 'function',
    function: {
      name: 'plan_agent',
      description: '专门处理计划表的智能体, 可以新建或者更新计划表',
      parameters: {
        type: 'object',
        properties: {
          instruction: {
            type: 'string',
            description: '本次要进行的操作说明'
          }
        },
        required: ['instruction']
      }
    }
  });

  const max_tokens = computedMaxToken({
    model: agentModel,
    maxToken,
    min: 100
  });

  const write = res ? responseWriteController({ res, readStream: stream }) : undefined;

  return await createLLMResponse({
    body: {
      model: agentModel.model,
      stream,
      reasoning: aiChatReasoning,
      messages,
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
    isAborted: () => res?.closed,
    userKey: externalProvider.openaiAccount,
    onReasoning({ text }) {
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
      if (call.function.name === 'plan_agent' || toolNode) {
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
    }
  });
}

// Sub运行
async function runSubWorkflows({
  toolCalls,
  toolNodes,
  runtimeNodes,
  runtimeEdges,
  workflowProps,
  workflowStreamResponse,
  agentModel,
  messages
}: any): Promise<ToolRunResponseType> {
  const toolNodesMap = new Map<string, ToolNodeItemType>();
  toolNodes.forEach((node: ToolNodeItemType) => {
    toolNodesMap.set(node.nodeId, node);
  });

  const toolsRunResponse: ToolRunResponseType = [];

  for await (const tool of toolCalls) {
    try {
      const toolNode = toolNodesMap.get(tool.function?.name);

      if (!toolNode && tool.function?.name !== 'plan_agent') {
        continue;
      }

      let toolRunResponse = null;
      let stringToolResponse = '';

      const toolArgs = (() => {
        try {
          return json5.parse(tool.function?.arguments || '{}');
        } catch (error) {
          console.error('Failed to parse tool arguments:', error);
          return {};
        }
      })();

      if (!toolNode && tool.function?.name === 'plan_agent') {
        stringToolResponse = (
          await transferPlanAgent({
            model: agentModel.model,
            toolId: tool.id,
            toolArgs: {
              instruction: toolArgs.instruction || ''
            },
            sharedContext: messages,
            customSystemPrompt: '',
            workflowStreamResponse
          })
        ).content;
      } else if (toolNode) {
        initToolNodes(runtimeNodes, [toolNode.nodeId], toolArgs);
        toolRunResponse = await dispatchWorkFlow({
          ...workflowProps,
          isToolCall: true
        } as any);
        stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);
      }

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
            toolName: toolNode?.name || tool.function.name,
            toolAvatar: toolNode?.avatar || '',
            params: '',
            response: sliceStrStartEnd(stringToolResponse, 5000, 5000)
          }
        }
      });

      toolsRunResponse.push({
        ...(toolRunResponse && { toolRunResponse }),
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

  return toolsRunResponse;
}

// Sub结果处理（plan特殊处理）
async function processSubResults({
  subResults,
  plan,
  llmResponse
}: {
  subResults: ToolRunResponseType;
  plan: AgentPlan[];
  llmResponse: any;
}) {
  // 处理计划相关的特殊逻辑
  const planResults = subResults.filter(
    (result) =>
      result.toolMsgParams.name === 'plan_agent' || result.toolMsgParams.name?.includes('plan')
  );

  for (const planResult of planResults) {
    try {
      const content =
        typeof planResult.toolMsgParams.content === 'string'
          ? planResult.toolMsgParams.content
          : JSON.stringify(planResult.toolMsgParams.content);
      const planData = JSON.parse(content);
      if (planData.type === 'plan_update') {
        // 更新计划
        plan.push(...(planData.plans || []));
      }
    } catch (error) {
      console.warn('Failed to parse plan result:', error);
    }
  }

  return {
    subResults,
    plan
  };
}

// 合并messages和使用记录
function mergeMeessagesAndUsage({
  conversationMessages,
  usageRecords,
  llmResponse,
  processedResults,
  response
}: any) {
  const { subResults } = processedResults;

  const flatToolsResponseData = subResults
    .map((item: any) => item.toolRunResponse)
    .flat()
    .filter(Boolean) as DispatchFlowResponse[];

  const newUsageRecords = response
    ? response.dispatchFlowResponse.concat(flatToolsResponseData)
    : flatToolsResponseData;

  const inputTokens = response
    ? response.agentCallInputTokens + llmResponse.usage.inputTokens
    : llmResponse.usage.inputTokens;

  const outputTokens = response
    ? response.agentCallOutputTokens + llmResponse.usage.outputTokens
    : llmResponse.usage.outputTokens;

  const nextRequestMessages: ChatCompletionMessageParam[] = [
    ...llmResponse.completeMessages,
    ...subResults.map((item: any) => item?.toolMsgParams)
  ];

  const toolNodeAssistant = GPTMessages2Chats({
    messages: [
      ...llmResponse.assistantMessage,
      ...subResults.map((item: any) => item?.toolMsgParams)
    ]
  })[0] as AIChatItemType;

  const toolChildAssistants = flatToolsResponseData
    .map((item) => item.assistantResponses)
    .flat()
    .filter((item) => item.type !== ChatItemValueTypeEnum.interactive);

  const concatAssistantResponses = [
    ...(response?.assistantResponses || []),
    ...toolNodeAssistant.value,
    ...toolChildAssistants
  ];

  const runTimes =
    (response?.runTimes || 0) + flatToolsResponseData.reduce((sum, item) => sum + item.runTimes, 0);

  return {
    messages: nextRequestMessages,
    usageRecords: newUsageRecords,
    assistantResponses: concatAssistantResponses,
    runTimes,
    inputTokens,
    outputTokens
  };
}

// 检查停止条件
function checkStopConditions({
  subResults,
  plan,
  llmResponse
}: {
  subResults: ToolRunResponseType;
  plan: AgentPlan[];
  llmResponse: any;
}) {
  const flatToolsResponseData = subResults
    .map((item) => item.toolRunResponse)
    .flat()
    .filter(Boolean) as DispatchFlowResponse[];

  // Check stop signal
  const hasStopSignal = flatToolsResponseData.some(
    (item) => !!item.flowResponses?.find((item) => item.toolStop)
  );

  // Check interactive response
  const workflowInteractiveResponseItem = subResults.find(
    (item) => item.toolRunResponse?.workflowInteractiveResponse
  );

  // 检查计划完成状态
  const allPlansCompleted = plan.length > 0 && plan.every((p) => p.status === 'completed');

  const shouldStop =
    hasStopSignal ||
    workflowInteractiveResponseItem ||
    allPlansCompleted ||
    llmResponse.toolCalls.length === 0;

  return {
    stop: shouldStop,
    interactiveResponse:
      workflowInteractiveResponseItem?.toolRunResponse?.workflowInteractiveResponse
  };
}

// 创建最终响应
function createFinalResponse({
  usageRecords,
  conversationMessages,
  assistantResponses,
  runTimes,
  inputTokens,
  outputTokens,
  finish_reason,
  interactiveResponse
}: any): RunAgentResponse {
  return {
    dispatchFlowResponse: usageRecords,
    agentCallInputTokens: inputTokens,
    agentCallOutputTokens: outputTokens,
    completeMessages: conversationMessages,
    assistantResponses,
    agentWorkflowInteractiveResponse: interactiveResponse,
    runTimes,
    finish_reason
  };
}

// 处理交互模式
async function handleInteractiveMode({
  runtimeNodes,
  runtimeEdges,
  interactiveEntryToolParams,
  workflowProps,
  workflowStreamResponse,
  usageRecords,
  conversationMessages,
  originalProps
}: any): Promise<RunAgentResponse> {
  initToolNodes(runtimeNodes, interactiveEntryToolParams.entryNodeIds);
  initToolCallEdges(runtimeEdges, interactiveEntryToolParams.entryNodeIds);

  const toolRunResponse = await dispatchWorkFlow({
    ...workflowProps,
    isToolCall: true
  });

  const stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);

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

  const hasStopSignal = toolRunResponse.flowResponses?.some((item) => item.toolStop);
  const workflowInteractiveResponse = toolRunResponse.workflowInteractiveResponse;

  const requestMessages = [
    ...conversationMessages,
    ...interactiveEntryToolParams.memoryMessages.map((item: any) =>
      item.role === 'tool' && item.tool_call_id === interactiveEntryToolParams.toolCallId
        ? { ...item, content: stringToolResponse }
        : item
    )
  ];

  if (hasStopSignal || workflowInteractiveResponse) {
    const agentWorkflowInteractiveResponse: WorkflowInteractiveResponseType | undefined =
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
      agentCallInputTokens: 0,
      agentCallOutputTokens: 0,
      completeMessages: requestMessages,
      assistantResponses: toolRunResponse.assistantResponses,
      runTimes: toolRunResponse.runTimes,
      agentWorkflowInteractiveResponse
    };
  }

  // 递归继续执行
  return runAgentCall(
    {
      ...originalProps,
      interactiveEntryToolParams: undefined,
      maxRunAgentTimes: 29,
      messages: requestMessages
    },
    {
      dispatchFlowResponse: [toolRunResponse],
      agentCallInputTokens: 0,
      agentCallOutputTokens: 0,
      assistantResponses: toolRunResponse.assistantResponses,
      runTimes: toolRunResponse.runTimes
    }
  );
}
