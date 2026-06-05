import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { runFastAgentMainLoop } from './loop';
import type { AgentLoopProvider } from '../type';
import type { AgentLoopInput, AgentLoopResult, AgentLoopRuntime } from '../../type';
import type { AgentLoopRuntime as FastAgentInternalRuntime } from './loop/type';
import { createAskUserAgentTool } from '../../systemTools/ask';
import { createUpdatePlanAgentTool } from '../../systemTools/plan';
import { createReadFilesTool } from '../../systemTools/readFile';
import { createAgentLoopSandboxTools } from '../../systemTools/sandbox';

export type FastAgentProviderState = {
  pendingMainContext?: import('./loop/type').PendingMainContext;
};

const readFastAgentProviderState = (providerState: unknown): FastAgentProviderState => {
  if (!providerState || typeof providerState !== 'object') return {};
  return providerState as FastAgentProviderState;
};

/**
 * 将 fastAgent 主循环适配为新的 provider contract。
 * 这里保留原 LLM/tool 循环行为，避免迁移 provider 架构时重写已验证的执行逻辑。
 */
export const runFastAgentLoop = async <TChildrenResponse = unknown>({
  input,
  runtime
}: {
  input: AgentLoopInput<TChildrenResponse>;
  runtime: AgentLoopRuntime<TChildrenResponse>;
}): Promise<AgentLoopResult<TChildrenResponse>> => {
  const providerState = readFastAgentProviderState(input.providerState);

  const fastAgentRuntime: FastAgentInternalRuntime<TChildrenResponse> = {
    model: runtime.llmParams.model,
    promptMode: runtime.llmParams.promptMode,
    reasoningEffort: runtime.llmParams.reasoningEffort,
    userKey: runtime.llmParams.userKey,
    stream: runtime.llmParams.stream,
    temperature: runtime.llmParams.temperature,
    maxTokens: runtime.llmParams.maxTokens,
    topP: runtime.llmParams.topP,
    stop: runtime.llmParams.stop,
    responseFormat: runtime.llmParams.responseFormat,
    retainDatasetCite: runtime.responseParams?.retainDatasetCite,
    useVision: runtime.llmParams.useVision,
    useAudio: runtime.llmParams.useAudio,
    useVideo: runtime.llmParams.useVideo,
    extractFiles: runtime.llmParams.extractFiles,
    lang: runtime.lang,
    maxRunAgentTimes: runtime.maxRunAgentTimes,
    maxStopGateRejections: runtime.maxStopGateRejections,
    batchToolSize: runtime.toolCatalog.batchToolSize,
    checkIsStopping: runtime.checkIsStopping,
    toolCatalog: {
      runtimeTools: runtime.toolCatalog.runtimeTools,
      ...(runtime.systemTools?.ask?.enabled ? { askTool: createAskUserAgentTool() } : {}),
      ...(runtime.systemTools?.plan?.enabled
        ? { updatePlanTool: createUpdatePlanAgentTool() }
        : {}),
      ...(runtime.systemTools?.sandbox?.enabled && runtime.systemTools.sandbox.client
        ? { sandboxTools: createAgentLoopSandboxTools() }
        : {}),
      ...(runtime.systemTools?.readFile?.enabled ? { readFileTool: createReadFilesTool() } : {})
    },
    executeTool: runtime.executeTool,
    executeInteractiveTool: runtime.executeInteractiveTool,
    sandboxToolContext:
      runtime.systemTools?.sandbox?.enabled && runtime.systemTools.sandbox.client
        ? {
            client: runtime.systemTools.sandbox.client
          }
        : undefined,
    executeReadFileTool: runtime.systemTools?.readFile?.execute,
    usagePush: runtime.usagePush,
    emitEvent: runtime.emitEvent
  };

  const result = await runFastAgentMainLoop({
    runtime: fastAgentRuntime,
    input: {
      messages: input.messages,
      systemPrompt: input.systemPrompt,
      activePlan: input.activePlan,
      pendingMainContext: providerState.pendingMainContext,
      userAnswer: input.userAnswer,
      childrenInteractiveParams: input.childrenInteractiveParams
    }
  });

  const nextProviderState =
    result.status === 'ask' && result.pendingMainContext
      ? {
          pendingMainContext: result.pendingMainContext
        }
      : undefined;

  if (input.userAnswer !== undefined) {
    runtime.emitEvent?.({
      type: 'ask_resume',
      answer: input.userAnswer
    });
  }

  if (result.status === 'ask' && result.ask) {
    runtime.emitEvent?.({
      type: 'ask',
      ask: result.ask,
      providerState: nextProviderState
    });
  }

  return {
    status: result.status,
    answerText: result.answerText,
    reasoningText: result.reasoningText,
    activePlan: result.activePlan,
    providerState: nextProviderState,
    ask: result.ask,
    askId: result.askId,
    completeMessages: result.completeMessages,
    assistantMessages: result.assistantMessages,
    assistantResponses: [],
    interactiveResponse: result.interactiveResponse,
    requestIds: result.requestIds,
    contextCheckpoint: result.contextCheckpoint,
    finishReason: result.finishReason,
    usage:
      result.inputTokens !== undefined ||
      result.outputTokens !== undefined ||
      result.llmTotalPoints !== undefined
        ? {
            inputTokens: result.inputTokens ?? 0,
            outputTokens: result.outputTokens ?? 0,
            llmTotalPoints: result.llmTotalPoints ?? 0
          }
        : undefined,
    error: result.error
  };
};

export const fastAgentProvider: AgentLoopProvider = {
  name: 'fastAgent',
  run: runFastAgentLoop
};

export const createFastAgentStopGateFeedbackMessage = (feedback: string) => ({
  role: ChatCompletionRequestMessageRoleEnum.User,
  content: feedback
});
