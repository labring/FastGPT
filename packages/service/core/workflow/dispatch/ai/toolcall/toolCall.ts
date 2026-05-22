import type {
  ChatCompletionMessageParam,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { ChildResponseItemType, DispatchToolModuleProps } from './type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { runAgentLoop } from '../../../../ai/llm/agentLoop';
import type {
  ToolCallChildrenInteractive,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useToolNodeResponse } from './hooks/useToolNodeResponse';
import { useToolCatalog } from './hooks/useToolCatalog';
import { useToolStreamResponse } from './hooks/useToolStreamResponse';
import { useToolRunner } from './hooks/useToolRunner';

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
    currentInputFiles,
    useAgentSandbox,
    lang: workflowProps.lang,
    appId: workflowProps.runningAppInfo.id,
    userId: workflowProps.uid,
    chatId: workflowProps.chatId
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
    allFiles,
    fileUrls: fileUrlList,
    getToolInfo,
    cacheToolFlowResponse,
    appendToolFlowResponse,
    streamToolResponse
  });

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
      useVision: aiChatVision,
      useAudio: aiChatAudio,
      useVideo: aiChatVideo,
      extractFiles: aiChatExtractFiles
    },
    childrenInteractiveParams,
    userKey: externalProvider.openaiAccount,
    isAborted: checkIsStopping,
    usagePush,
    /**
     * ToolCall 节点内部工具执行依赖流式输出、交互状态和 nodeResponse 顺序，
     * 这里显式保持串行，Agent 入口再按 batchToolSize 控制普通工具并发。
     */
    canBatchTool: () => false,
    onAfterCompressContext({ usage, requestIds, seconds }) {
      appendContextCompressNodeResponse({
        usage,
        requestIds,
        seconds
      });
    },
    onReasoning({ text }) {
      streamReasoning(text);
    },
    onStreaming({ text }) {
      streamAnswer(text);
    },
    onToolCall({ call }) {
      streamToolCall(call);
    },
    onToolParam({ call, argsDelta }) {
      streamToolParams({
        call,
        argsDelta
      });
    },
    onAfterToolCall({ call, response, errorMessage, seconds, toolResponseCompress }) {
      streamToolResponse({
        toolCallId: call.id,
        response
      });

      appendToolNodeResponse({
        call,
        response,
        errorMessage,
        seconds,
        toolResponseCompress
      });
    },
    onRunTool: runTool,
    onRunInteractiveTool: runInteractiveTool
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
