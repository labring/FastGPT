import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { runFastAgentMainLoop } from './loop';
import type {
  AgentLoopInput,
  AgentLoopProvider,
  AgentLoopResult,
  AgentLoopRuntime,
  AgentLoopUsage
} from '../../domain';
import type { AgentLoopRuntime as FastAgentInternalRuntime } from './loop/type';
import { createAskUserAgentTool } from '../../domain/systemTool/ask';
import { createUpdatePlanAgentTool } from '../../domain/systemTool/plan';
import { createReadFilesTool } from '../../domain/systemTool/readFile';
import { createAgentLoopSandboxTools } from '../../domain/systemTool/sandbox';
import { createDatasetSearchTool } from '../../domain/systemTool/datasetSearch';
import { AgentUsageModuleName } from '../../domain/usage';

export type FastAgentProviderState = {
  pendingMainContext?: import('./loop/type').PendingMainContext;
};

const readFastAgentProviderState = (providerState: unknown): FastAgentProviderState => {
  if (!providerState || typeof providerState !== 'object') return {};
  return providerState as FastAgentProviderState;
};

/**
 * result.usages 是只读观测汇总，供 workflow 节点输出 token/points 摘要。
 * 真实账单仍由 loop 运行过程中逐次 usagePush，不在 result 层重复推送。
 */
const buildFastAgentResultUsages = ({
  inputTokens,
  outputTokens,
  llmTotalPoints
}: {
  inputTokens?: number;
  outputTokens?: number;
  llmTotalPoints?: number;
}): AgentLoopUsage[] => {
  if (inputTokens === undefined && outputTokens === undefined && llmTotalPoints === undefined) {
    return [];
  }

  return [
    {
      moduleName: AgentUsageModuleName.agentCall,
      inputTokens: inputTokens ?? 0,
      outputTokens: outputTokens ?? 0,
      totalPoints: llmTotalPoints ?? 0
    }
  ];
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
    teamId: runtime.teamId,
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
      ...(runtime.systemTools?.readFile?.enabled ? { readFileTool: createReadFilesTool() } : {}),
      ...(runtime.systemTools?.datasetSearch?.enabled
        ? { datasetSearchTool: createDatasetSearchTool() }
        : {})
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
    executeDatasetSearchTool: runtime.systemTools?.datasetSearch?.execute,
    datasetSearchCurrentInputFiles: runtime.systemTools?.datasetSearch?.currentInputFiles,
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

  const askPause = result.pause?.type === 'ask' ? result.pause : undefined;
  const nextProviderState =
    askPause && result.pendingMainContext
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

  if (askPause) {
    runtime.emitEvent?.({
      type: 'ask',
      ask: askPause.ask,
      providerState: nextProviderState
    });
  }

  const commonResult = {
    activePlan: result.activePlan,
    providerState: nextProviderState,
    completeMessages: result.completeMessages,
    assistantMessages: result.assistantMessages,
    requestIds: result.requestIds,
    contextCheckpoint: result.contextCheckpoint,
    finishReason: result.finishReason ?? 'stop',
    usages: buildFastAgentResultUsages({
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      llmTotalPoints: result.llmTotalPoints
    })
  };

  if (result.status === 'paused') {
    return {
      ...commonResult,
      status: 'paused',
      pause: result.pause
    };
  }

  if (result.status === 'error') {
    return {
      ...commonResult,
      status: 'error',
      error: result.error ?? new Error('FastAgent loop failed')
    };
  }

  if (result.status === 'aborted') {
    return {
      ...commonResult,
      status: 'aborted',
      error: result.error
    };
  }

  return {
    ...commonResult,
    status: 'done'
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
