import type {
  ChatCompletionMessageParam,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { DispatchToolModuleProps } from './type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { normalizeAgentLoopUsages } from '../../../../ai/llm/agentLoop/interface';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { ToolInfo } from './hooks/useToolCatalog';
import {
  createAgentLoopCoreRuntimeEnvironment,
  createAgentLoopCoreRuntimeWithEnvironment,
  buildAgentLoopCoreInput,
  runAgentLoopCoreWithSummary,
  type AgentLoopCoreToolRunFlowResponse
} from '../agentLoopCore/interface';
import { createToolCallToolProvider } from './toolProvider';

type ResponseType = {
  requestIds: string[];
  error?: string;
  toolDispatchFlowResponses: AgentLoopCoreToolRunFlowResponse[];
  toolCallInputTokens: number;
  toolCallOutputTokens: number;
  toolCallTotalPoints: number; // 每次 LLM 调用单独计价后的累计价格（用于梯度计费）
  completeMessages: ChatCompletionMessageParam[];
  assistantResponses: AIChatItemValueItemType[];
  finish_reason: CompletionFinishReason;
  toolWorkflowInteractiveResponse?: InteractiveNodeResponseType;
};

export const runToolCall = async (props: DispatchToolModuleProps): Promise<ResponseType> => {
  const { messages, toolNodes, toolModel, childrenInteractiveParams, ...workflowProps } = props;
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

  // provider 在后面创建，但 nodeResponse/SSE hook 初始化时已经需要 getToolInfo。
  // 用延迟代理避免初始化环，实际事件触发一定发生在 provider 创建之后。
  let getProviderToolInfo: (name: string) => ToolInfo | undefined = () => undefined;
  const getToolInfo = (name: string) => getProviderToolInfo(name);

  const runtimeEnvironment = createAgentLoopCoreRuntimeEnvironment({
    node: workflowProps.node,
    workflowStreamResponse,
    streamAnswer: isResponseAnswerText,
    streamReasoning: aiChatReasoning,
    sliceToolResponse: true,
    getToolInfo,
    collectToolRunResponses: true
  });
  const toolProvider = await createToolCallToolProvider({
    messages,
    toolNodes,
    useAgentSandbox,
    lang: workflowProps.lang,
    workflowProps,
    runtimeNodes,
    runtimeEdges,
    cacheToolFlowResponse: runtimeEnvironment.cacheToolFlowResponse
  });
  getProviderToolInfo = toolProvider.getToolInfo;

  const { summary: outputSummary } =
    await runAgentLoopCoreWithSummary<WorkflowInteractiveResponseType>({
      provider: 'fastAgent',
      input: buildAgentLoopCoreInput({
        messages: toolProvider.finalMessages,
        childrenInteractiveParams
      }),
      runtime: createAgentLoopCoreRuntimeWithEnvironment({
        teamId: workflowProps.runningUserInfo.teamId,
        environment: runtimeEnvironment,
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
          planEnabled: false,
          askEnabled: false,
          sandboxClient:
            useAgentSandbox && global.feConfigs?.show_agent_sandbox
              ? workflowProps.sandboxClient
              : undefined,
          readFile: toolProvider.readFileExecutor
            ? {
                enabled: true,
                maxFileAmount: toolProvider.readFileMaxFileAmount,
                execute: toolProvider.readFileExecutor
              }
            : undefined,
          datasetSearch: toolProvider.datasetSearchExecutor
            ? {
                enabled: true,
                currentInputFiles: fileUrlList,
                execute: toolProvider.datasetSearchExecutor
              }
            : undefined
        },
        maxRunAgentTimes: 50,
        checkIsStopping,
        toolRuntime: {
          toolProvider,
          /**
           * ToolCall 节点内部工具执行依赖流式输出、交互状态和 nodeResponse 顺序，
           * 这里显式保持串行；普通 Agent 入口再按 batchToolSize 控制并发。
           */
          batchToolSize: 1,
          normalizeInteractiveUsages: normalizeAgentLoopUsages
        },
        usagePush
      }),
      assistantResponses: {
        showReasoning: aiChatReasoning,
        getEventToolInfo: getToolInfo
      }
    });

  return {
    requestIds: outputSummary.requestIds,
    error: outputSummary.errorText,
    toolDispatchFlowResponses: runtimeEnvironment.toolRunResponses,
    toolCallInputTokens: outputSummary.inputTokens,
    toolCallOutputTokens: outputSummary.outputTokens,
    toolCallTotalPoints: outputSummary.llmTotalPoints,
    completeMessages: outputSummary.completeMessages,
    assistantResponses: outputSummary.assistantResponses,
    finish_reason: outputSummary.finishReason,
    toolWorkflowInteractiveResponse: outputSummary.interactive
  };
};
