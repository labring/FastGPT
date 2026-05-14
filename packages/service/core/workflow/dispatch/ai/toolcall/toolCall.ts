import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { runWorkflow } from '../../index';
import type { ChildResponseItemType, DispatchToolModuleProps, ToolNodeItemType } from './type';
import { chats2GPTMessages, GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { formatToolResponse, initToolCallEdges, initToolNodes } from './utils';
import { parseJsonArgs } from '../../../../ai/utils';
import { getNanoid, sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { toolValueTypeList, valueTypeJsonSchemaMap } from '@fastgpt/global/core/workflow/constants';
import { runAgentLoop } from '../../../../ai/llm/agentLoop';
import type {
  ToolCallChildrenInteractive,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { JsonSchemaPropertiesItemType } from '@fastgpt/global/core/app/jsonschema';
import { SANDBOX_SYSTEM_PROMPT, SANDBOX_TOOLS } from '@fastgpt/global/core/ai/sandbox/constants';
import { getSandboxToolWorkflowResponse } from './constants';
import {
  getSandboxToolInfo,
  injectSandboxFiles,
  runSandboxTools
} from '../../../../ai/sandbox/toolCall';
import {
  dispatchReadFileTool,
  ReadFileTooData,
  ReadFileToolParamsSchema,
  ReadFileToolSchema
} from './tools/file';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { i18nT } from '../../../../../../web/i18n/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';

type ResponseType = {
  requestIds: string[];
  error?: string;
  toolDispatchFlowResponses: ChildResponseItemType[];
  toolCallInputTokens: number;
  toolCallOutputTokens: number;
  toolCallTotalPoints: number; // 每次 LLM 调用单独计价后的累计价格（用于梯度计费）
  completeMessages: ChatCompletionMessageParam[];
  assistantResponses: AIChatItemValueItemType[];
  finish_reason: CompletionFinishReason;
  toolWorkflowInteractiveResponse?: ToolCallChildrenInteractive;
};

export const runToolCall = async (props: DispatchToolModuleProps): Promise<ResponseType> => {
  const {
    messages,
    toolNodes,
    toolModel,
    childrenInteractiveParams,
    allFiles,
    currentInputFiles,

    ...workflowProps
  } = props;
  const {
    checkIsStopping,
    requestOrigin,
    runtimeNodes,
    runtimeEdges,
    stream,
    retainDatasetCite = true,
    externalProvider,
    workflowStreamResponse,
    usagePush,
    params: {
      temperature,
      maxToken,
      aiChatVision,
      aiChatTopP,
      aiChatStopSign,
      aiChatResponseFormat,
      aiChatJsonSchema,
      aiChatReasoning,
      aiChatReasoningEffort,
      isResponseAnswerText = true,
      useAgentSandbox
    }
  } = workflowProps;

  // 注入 sandbox_shell 工具和提示词
  let finalMessages = messages;
  // 工具响应原始值
  const toolRunResponses: ChildResponseItemType[] = [];
  // 压缩是 ToolCall 运行过程里的内部子 LLM 调用：
  // 子 nodeResponse 单独记录自己的 requestIds/usage，父 ToolCall 只记录主 Agent Loop LLM 请求。
  const toolFlowResponseIndexMap = new Map<string, number>();
  const toolResponseCompressRecordMap = new Map<
    string,
    {
      call: ChatCompletionMessageToolCall;
      nodeResponse: ChatHistoryItemResType;
      usage: ChatNodeUsageType;
    }
  >();
  type ToolResponseCompressRecord = NonNullable<
    ReturnType<typeof toolResponseCompressRecordMap.get>
  >;

  const createCompressNodeResponse = ({
    idPrefix,
    moduleName,
    usage,
    requestIds,
    seconds,
    textOutput
  }: {
    idPrefix: string;
    moduleName: string;
    usage: ChatNodeUsageType;
    requestIds: string[];
    seconds: number;
    textOutput?: string;
  }) => {
    const validRequestIds = requestIds.filter(Boolean);

    const id = `${idPrefix}-${validRequestIds[0] || getNanoid()}`;

    return {
      id,
      nodeId: id,
      moduleName,
      moduleType: workflowProps.node.flowNodeType,
      moduleLogo: 'core/app/agent/child/contextCompress',
      runningTime: seconds,
      model: usage.model,
      llmRequestIds: validRequestIds.length ? validRequestIds : undefined,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalPoints: usage.totalPoints,
      textOutput,
      compressTextAgent: {
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        totalPoints: usage.totalPoints
      }
    };
  };

  const appendContextCompressNodeResponse = ({
    usage,
    requestIds,
    seconds
  }: {
    usage: ChatNodeUsageType;
    requestIds: string[];
    seconds: number;
  }) => {
    const nodeResponse = createCompressNodeResponse({
      idPrefix: `${workflowProps.node.nodeId}-context-compress`,
      moduleName: i18nT('chat:compress_llm_messages'),
      usage,
      requestIds,
      seconds
    });

    toolRunResponses.push({
      flowResponses: [nodeResponse],
      // dispatchRunTools 会把这里的 flowUsages 汇总成父 ToolCall nodeResponse.childTotalPoints。
      flowUsages: [usage],
      runTimes: 0
    });
  };

  const recordToolResponseCompressNodeResponse = ({
    call,
    response,
    usage,
    requestIds,
    seconds
  }: {
    call: ChatCompletionMessageToolCall;
    response: string;
    usage: ChatNodeUsageType;
    requestIds: string[];
    seconds: number;
  }) => {
    const nodeResponse = createCompressNodeResponse({
      idPrefix: `${workflowProps.node.nodeId}-tool-response-compress-${call.id}`,
      moduleName: i18nT('chat:tool_response_compress'),
      usage,
      requestIds,
      seconds,
      textOutput: response
    });

    const compressRecord = {
      call,
      nodeResponse,
      usage
    };

    if (!appendToolResponseCompressRecord(compressRecord)) {
      toolResponseCompressRecordMap.set(call.id, compressRecord);
    }
  };

  const appendCompressRecordToToolFlowResponse = ({
    flowResponse,
    compressRecord
  }: {
    flowResponse: ChildResponseItemType;
    compressRecord: ToolResponseCompressRecord;
  }): ChildResponseItemType => {
    const matchIndex = flowResponse.flowResponses.findIndex((item) => {
      return (
        item.id === compressRecord.call.id ||
        item.id === compressRecord.call.function.name ||
        item.nodeId === compressRecord.call.id ||
        item.nodeId === compressRecord.call.function.name ||
        item.toolId === compressRecord.call.id ||
        item.toolId === compressRecord.call.function.name
      );
    });
    const targetIndex = matchIndex >= 0 ? matchIndex : flowResponse.flowResponses.length - 1;
    if (targetIndex < 0) return flowResponse;

    return {
      ...flowResponse,
      flowResponses: flowResponse.flowResponses.map((item, index) => {
        if (index !== targetIndex) return item;

        return {
          ...item,
          childrenResponses: [...(item.childrenResponses || []), compressRecord.nodeResponse]
        };
      }),
      // 工具响应压缩的费用属于该工具调用的内部子消耗，父 ToolCall 仍通过 flowUsages 汇总 childTotalPoints。
      flowUsages: [...flowResponse.flowUsages, compressRecord.usage]
    };
  };

  const appendToolResponseCompressRecord = (compressRecord: ToolResponseCompressRecord) => {
    const flowResponseIndex = toolFlowResponseIndexMap.get(compressRecord.call.id);
    if (flowResponseIndex === undefined) return false;

    toolRunResponses[flowResponseIndex] = appendCompressRecordToToolFlowResponse({
      flowResponse: toolRunResponses[flowResponseIndex],
      compressRecord
    });
    return true;
  };

  const appendToolFlowResponse = ({
    toolCallId,
    flowResponse
  }: {
    toolCallId: string;
    flowResponse: ChildResponseItemType;
  }) => {
    const compressRecord = toolResponseCompressRecordMap.get(toolCallId);
    if (!compressRecord) {
      toolRunResponses.push(flowResponse);
      toolFlowResponseIndexMap.set(toolCallId, toolRunResponses.length - 1);
      return;
    }

    toolResponseCompressRecordMap.delete(toolCallId);
    toolRunResponses.push(
      appendCompressRecordToToolFlowResponse({
        flowResponse,
        compressRecord
      })
    );
    toolFlowResponseIndexMap.set(toolCallId, toolRunResponses.length - 1);
  };

  // 构建 tools 参数
  const toolNodesMap = new Map<string, ToolNodeItemType>();
  const tools: ChatCompletionTool[] = toolNodes.map((item) => {
    toolNodesMap.set(item.nodeId, item);
    if (item.jsonSchema) {
      return {
        type: 'function',
        function: {
          name: item.nodeId,
          description: `${item.name}: ${item.toolDescription || item.intro}`,
          parameters: item.jsonSchema
        }
      };
    }

    const properties: Record<string, JsonSchemaPropertiesItemType> = {};
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
        description: `${item.name}: ${item.toolDescription || item.intro}`,
        parameters: {
          type: 'object',
          properties,
          required: item.toolParams.filter((item) => item.required).map((item) => item.key)
        }
      }
    };
  });

  // 注入 readFile tool
  if (allFiles.size > 0) {
    tools.push(ReadFileToolSchema);
  }

  // 注入 sandbox tool
  if (useAgentSandbox && global.feConfigs?.show_agent_sandbox) {
    // 注入 sandbox_shell 工具
    tools.push(...SANDBOX_TOOLS);

    // 追加提示词
    const systemMessage = messages.find((m) => m.role === 'system');
    if (systemMessage) {
      finalMessages = messages.map((m) =>
        m.role === 'system' ? { ...m, content: `${m.content}\n\n${SANDBOX_SYSTEM_PROMPT}` } : m
      );
    } else {
      finalMessages = [{ role: 'system', content: SANDBOX_SYSTEM_PROMPT }, ...messages];
    }

    // 注入文件到沙盒里
    if (currentInputFiles.length > 0) {
      await injectSandboxFiles({
        appId: workflowProps.runningAppInfo.id,
        userId: workflowProps.uid,
        chatId: workflowProps.chatId,
        files: currentInputFiles.map((file) => ({
          path: file.sandboxPath!,
          url: file.url
        }))
      });
    }
  }

  const getToolInfo = (name: string) => {
    if (name === ReadFileTooData.id) {
      return {
        type: 'file' as const,
        name: parseI18nString(ReadFileTooData.name, workflowProps.lang),
        avatar: ReadFileTooData.avatar
      };
    }
    const sandboxToolInfo = getSandboxToolInfo(name, workflowProps.lang);
    if (sandboxToolInfo) {
      return {
        type: 'sandbox' as const,
        name: sandboxToolInfo.name,
        avatar: sandboxToolInfo.avatar
      };
    }

    const toolNode = toolNodesMap.get(name);
    if (toolNode) {
      return {
        type: 'user' as const,
        name: toolNode.name,
        avatar: toolNode.avatar,
        rawData: toolNode
      };
    }
  };

  const {
    inputTokens,
    outputTokens,
    llmTotalPoints,
    completeMessages,
    assistantMessages,
    interactiveResponse,
    finish_reason,
    error,
    requestIds
  } = await runAgentLoop<WorkflowInteractiveResponseType>({
    maxRunAgentTimes: 50,
    body: {
      messages: finalMessages,
      tools,
      model: toolModel.model,
      max_tokens: maxToken,
      stream,
      temperature,
      top_p: aiChatTopP,
      stop: aiChatStopSign,
      reasoning_effort: aiChatReasoningEffort,
      response_format: {
        type: aiChatResponseFormat,
        json_schema: aiChatJsonSchema
      },
      requestOrigin,
      retainDatasetCite,
      useVision: aiChatVision
    },
    childrenInteractiveParams,
    userKey: externalProvider.openaiAccount,
    isAborted: checkIsStopping,
    usagePush,
    onAfterCompressContext({ usage, requestIds, seconds }) {
      appendContextCompressNodeResponse({
        usage,
        requestIds,
        seconds
      });
    },
    onAfterToolResponseCompress({ call, response, usage, requestIds, seconds }) {
      recordToolResponseCompressNodeResponse({
        call,
        response,
        usage,
        requestIds,
        seconds
      });
    },
    onReasoning({ text }) {
      if (!aiChatReasoning) return;
      workflowStreamResponse?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          reasoning_content: text
        })
      });
    },
    onStreaming({ text }) {
      if (!isResponseAnswerText) return;
      workflowStreamResponse?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text
        })
      });
    },
    onToolCall({ call }) {
      if (!isResponseAnswerText) return;
      const toolNode = getToolInfo(call.function.name);
      if (toolNode) {
        workflowStreamResponse?.({
          id: call.id,
          event: SseResponseEventEnum.toolCall,
          data: {
            tool: {
              id: call.id,
              toolName: toolNode.name,
              toolAvatar: toolNode.avatar,
              functionName: call.function.name,
              params: call.function.arguments ?? ''
            }
          }
        });
      }
    },
    onToolParam({ call, argsDelta }) {
      if (!isResponseAnswerText) return;
      workflowStreamResponse?.({
        id: call.id,
        event: SseResponseEventEnum.toolParams,
        data: {
          tool: {
            id: call.id,
            toolName: '',
            toolAvatar: '',
            params: argsDelta
          }
        }
      });
    },
    onAfterToolCall({ call, response }) {
      if (!isResponseAnswerText) return;
      workflowStreamResponse?.({
        id: call.id,
        event: SseResponseEventEnum.toolResponse,
        data: {
          tool: {
            id: call.id,
            toolName: '',
            toolAvatar: '',
            params: '',
            response: sliceStrStartEnd(response || '', 5000, 5000)
          }
        }
      });
    },
    onRunTool: async ({ call }) => {
      const toolInfo = getToolInfo(call.function?.name);
      if (!toolInfo) {
        return {
          response: 'Call tool not found',
          assistantMessages: [],
          usages: [],
          interactive: undefined,
          stop: false
        };
      }

      const {
        response,
        flowResponse,
        assistantMessages = [],
        usages = [],
        interactive,
        stop
      } = await (async () => {
        // 拦截 sandbox 工具调用
        if (toolInfo.type === 'sandbox') {
          const { input, response, durationSeconds } = await runSandboxTools({
            toolName: call.function.name,
            args: call.function.arguments ?? '',
            appId: workflowProps.runningAppInfo.id,
            userId: workflowProps.uid,
            chatId: workflowProps.chatId
          });

          const flowResponse = getSandboxToolWorkflowResponse({
            name: toolInfo.name,
            logo: toolInfo.avatar,
            toolId: call.function.name,
            input,
            response,
            durationSeconds
          });

          return { response, flowResponse };
        } else if (toolInfo.type === 'file') {
          const { ids } = ReadFileToolParamsSchema.parse(parseJsonArgs(call.function.arguments));
          const { response, usages, flowResponse } = await dispatchReadFileTool({
            files: ids.map((id) => ({ id, url: allFiles.get(id)?.url ?? '' })),
            toolCallId: call.id,
            teamId: workflowProps.runningUserInfo.teamId,
            tmbId: workflowProps.runningUserInfo.tmbId,
            customPdfParse: workflowProps.chatConfig?.fileSelectConfig?.customPdfParse,
            usageId: workflowProps.usageId
          });
          return {
            response,
            usages,
            flowResponse
          };
        } else {
          const toolNode = toolInfo.rawData;

          // Init tool params and run
          const startParams = parseJsonArgs(call.function.arguments);
          initToolNodes(runtimeNodes, [toolNode.nodeId], startParams);
          initToolCallEdges(runtimeEdges, [toolNode.nodeId]);

          const toolRunResponse = await runWorkflow({
            ...workflowProps,
            runtimeNodes,
            isToolCall: true
          });

          // Format tool response
          const stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);

          return {
            response: stringToolResponse,
            flowResponse: toolRunResponse,
            assistantMessages: chats2GPTMessages({
              messages: [
                {
                  obj: ChatRoleEnum.AI,
                  value: toolRunResponse.assistantResponses
                }
              ],
              reserveId: false
            }),
            usages: toolRunResponse.flowUsages,
            interactive: toolRunResponse.workflowInteractiveResponse,
            stop: toolRunResponse.flowResponses?.some((item) => item.toolStop)
          };
        }
      })();

      // flowResponse 需要在工具执行完成后立即记录；前端 toolResponse 等压缩后由 onAfterToolCall 推送。
      {
        if (flowResponse) {
          appendToolFlowResponse({
            toolCallId: call.id,
            flowResponse
          });
        }
      }

      return {
        response,
        assistantMessages,
        usages,
        interactive,
        stop
      };
    },
    onRunInteractiveTool: async ({ childrenResponse, toolParams }) => {
      initToolNodes(runtimeNodes, childrenResponse.entryNodeIds);
      initToolCallEdges(runtimeEdges, childrenResponse.entryNodeIds);

      const toolRunResponse = await runWorkflow({
        ...workflowProps,
        lastInteractive: childrenResponse,
        runtimeNodes,
        runtimeEdges,
        isToolCall: true
      });
      // console.dir(runtimeEdges, { depth: null });
      const stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);

      if (isResponseAnswerText) {
        workflowStreamResponse?.({
          id: toolParams.toolCallId,
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
      }

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
    reserveReason: aiChatReasoning,
    getToolInfo
  })
    .map((item) => item.value as AIChatItemValueItemType[])
    .flat();

  return {
    requestIds,
    error,
    toolDispatchFlowResponses: toolRunResponses,
    toolCallInputTokens: inputTokens,
    toolCallOutputTokens: outputTokens,
    toolCallTotalPoints: llmTotalPoints,
    completeMessages,
    assistantResponses,
    finish_reason,
    toolWorkflowInteractiveResponse: interactiveResponse
  };
};
