import type {
  ChatCompletionMessageParam,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { ChildResponseItemType, DispatchToolModuleProps } from './type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { normalizeAgentLoopUsages, runAgentLoop } from '../../../../ai/llm/agentLoop';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type {
  ToolCallChildrenInteractive,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useToolNodeResponse } from './hooks/useToolNodeResponse';
import { useToolCatalog } from './hooks/useToolCatalog';
import { useToolStreamResponse } from './hooks/useToolStreamResponse';
import { useToolRunner } from './hooks/useToolRunner';
import { useToolEventEmitter } from './hooks/useToolEventEmitter';
import { ReadFilesToolParamsSchema } from '../../../../ai/llm/agentLoop/systemTools/readFile';
import { dispatchReadFileTool, getToolCallFileUrl } from './tools/file';
import { parseJsonArgs } from '../../../../ai/utils';

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
  const { messages, toolNodes, toolModel, childrenInteractiveParams, allFiles, ...workflowProps } =
    props;
  const {
    checkIsStopping,
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
      aiChatAudio,
      aiChatVideo,
      aiChatExtractFiles,
      aiChatTopP,
      aiChatStopSign,
      aiChatResponseFormat,
      aiChatJsonSchema,
      aiChatReasoning,
      aiChatReasoningEffort,
      isResponseAnswerText = true,
      useAgentSandbox,
      fileUrlList
    }
  } = workflowProps;

  const { finalMessages, tools, getToolInfo } = await useToolCatalog({
    messages,
    toolNodes,
    useAgentSandbox,
    lang: workflowProps.lang
  });
  // ToolCall 的一次运行会横跨 LLM loop、真实工具执行、SSE 预览和运行详情落库。
  // 这里按职责拆成 hook，toolCall.ts 只保留主流程编排。
  const {
    toolRunResponses,
    cacheToolFlowResponse,
    appendToolNodeResponse,
    appendToolFlowResponse,
    appendContextCompressNodeResponse
  } = useToolNodeResponse({
    moduleType: workflowProps.node.flowNodeType,
    getToolInfo
  });
  const { streamReasoning, streamAnswer, streamToolCall, streamToolParams, streamToolResponse } =
    useToolStreamResponse({
      workflowStreamResponse,
      isResponseAnswerText,
      aiChatReasoning,
      getToolInfo
    });
  const { runTool, runInteractiveTool } = useToolRunner({
    workflowProps,
    runtimeNodes,
    runtimeEdges,
    fileUrls: fileUrlList,
    getToolInfo,
    cacheToolFlowResponse,
    appendToolFlowResponse,
    streamToolResponse
  });
  const { emitEvent } = useToolEventEmitter({
    streamReasoning,
    streamAnswer,
    streamToolCall,
    streamToolParams,
    streamToolResponse,
    appendToolNodeResponse,
    appendContextCompressNodeResponse
  });
  const pushAgentLoopUsages = (usages?: ChatNodeUsageType[]) => {
    const normalizedUsages = normalizeAgentLoopUsages(usages);
    if (normalizedUsages.length > 0) {
      usagePush(normalizedUsages);
    }
  };

  const result = await runAgentLoop<WorkflowInteractiveResponseType>({
    provider: 'fastAgent',
    input: {
      messages: finalMessages,
      childrenInteractiveParams
    },
    runtime: {
      llmParams: {
        model: toolModel.model,
        promptMode: 'raw',
        maxTokens: maxToken,
        stream,
        temperature,
        topP: aiChatTopP,
        stop: aiChatStopSign,
        reasoningEffort: aiChatReasoningEffort,
        responseFormat: {
          type: aiChatResponseFormat,
          json_schema: aiChatJsonSchema
        },
        useVision: aiChatVision,
        useAudio: aiChatAudio,
        useVideo: aiChatVideo,
        extractFiles: aiChatExtractFiles,
        userKey: externalProvider.openaiAccount
      },
      responseParams: {
        retainDatasetCite
      },
      lang: workflowProps.lang,
      systemTools: {
        plan: {
          enabled: false
        },
        ask: {
          enabled: false
        },
        ...(useAgentSandbox && global.feConfigs?.show_agent_sandbox && workflowProps.sandboxClient
          ? {
              sandbox: {
                enabled: true,
                client: workflowProps.sandboxClient
              }
            }
          : {}),
        ...(allFiles.size > 0
          ? {
              readFile: {
                enabled: true,
                execute: async ({ call }) => {
                  const rawArgs = parseJsonArgs(call.function.arguments);
                  const toolParams = ReadFilesToolParamsSchema.safeParse(rawArgs);
                  if (!toolParams.success) {
                    return {
                      response: toolParams.error.message,
                      usages: []
                    };
                  }
                  const files = toolParams.data.ids.map((id) => {
                    const file = allFiles.get(id);

                    return {
                      id,
                      ...(file?.name ? { name: file.name } : {}),
                      url: getToolCallFileUrl({
                        id,
                        allFiles,
                        fileUrlList
                      })
                    };
                  });
                  const result = await dispatchReadFileTool({
                    files,
                    toolCallId: call.id,
                    teamId: workflowProps.runningUserInfo.teamId,
                    tmbId: workflowProps.runningUserInfo.tmbId,
                    customPdfParse: workflowProps.chatConfig?.fileSelectConfig?.customPdfParse,
                    usageId: workflowProps.usageId
                  });
                  return {
                    response: result.response,
                    usages: result.usages ?? [],
                    nodeResponse: result.flowResponse.flowResponses[0]
                  };
                }
              }
            }
          : {})
      },
      maxRunAgentTimes: 50,
      checkIsStopping,
      toolCatalog: {
        runtimeTools: tools,
        /**
         * ToolCall 节点内部工具执行依赖流式输出、交互状态和 nodeResponse 顺序，
         * 这里显式保持串行；普通 Agent 入口再按 batchToolSize 控制并发。
         */
        batchToolSize: 1
      },
      executeTool: async ({ call }) => {
        const toolResult = await runTool({ call });
        return {
          response: toolResult.response,
          assistantMessages: toolResult.assistantMessages || [],
          usages: toolResult.usages || [],
          interactive: toolResult.interactive,
          stop: toolResult.stop
        };
      },
      executeInteractiveTool: async (params) => {
        const toolResult = await runInteractiveTool(
          params as Parameters<typeof runInteractiveTool>[0]
        );
        const usages = normalizeAgentLoopUsages(toolResult.usages);

        return {
          response: toolResult.response,
          assistantMessages: toolResult.assistantMessages || [],
          usages,
          interactive: toolResult.interactive,
          stop: toolResult.stop
        };
      },
      usagePush: pushAgentLoopUsages,
      emitEvent
    }
  });

  const {
    completeMessages = [],
    assistantMessages = [],
    interactiveResponse,
    error,
    requestIds
  } = result;
  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;
  const llmTotalPoints = result.usage?.llmTotalPoints ?? 0;
  const finish_reason = result.finishReason || 'stop';

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
    error: typeof error === 'string' ? error : undefined,
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
