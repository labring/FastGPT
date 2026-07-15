import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { parseJsonArgs } from '../../../../../utils';
import { runAgentLoop } from './base';
import { getMainAgentSystemPrompt } from '../prompt/mainPrompt';
import { parseAgentAskToolCall, type AgentAskPayload } from '../../../domain/systemTool/ask';
import { applyPlanUpdate } from '../../../domain/systemTool/plan';
import type { AgentLoopEvent } from './type';
import { normalizeAgentLoopUsages, type AgentLoopUsage } from '../../../domain';
import { getToolsForFastAgentLoop, normalizeToolCatalog } from '../tools';
import { toSandboxToolName } from '../../../domain/systemTool/sandbox';
import { patchDatasetSearchParams } from '../../../domain/systemTool/datasetSearch';
import { AgentUsageModuleName } from '../../../domain/usage';
import type {
  AgentLoopRuntime,
  AgentLoopToolExecutionResult,
  FastAgentLoopInput,
  FastAgentLoopResult,
  PendingMainContext
} from './type';
import { runSandboxTools } from '../../../../../sandbox/interface/toolCall';
import { normalizeToolResponseContent } from '@fastgpt/global/core/ai/llm/utils';

/**
 * 创建工具执行结果的最小结构。
 * 内置工具大多不需要追加 assistantMessages/usages，因此默认置空，由调用方按需覆盖。
 */
const createToolResponse = <TChildrenResponse = unknown>(
  response: string,
  extra?: Partial<AgentLoopToolExecutionResult<TChildrenResponse>>
): AgentLoopToolExecutionResult<TChildrenResponse> => ({
  response,
  assistantMessages: [],
  usages: [],
  ...extra
});

/**
 * 构造主 Agent system message，集中使用枚举值避免各处手写 role 字符串。
 */
const createSystemMessage = (content: string): ChatCompletionMessageParam => ({
  role: ChatCompletionRequestMessageRoleEnum.System,
  content
});

type PlanOperationEvent = Extract<AgentLoopEvent, { type: 'plan_operation' }>;

/**
 * 从 update_plan 参数中提取前端可展示的粗粒度 plan 操作类型。
 * 参数异常或缺失时按步骤更新处理，保证 plan_operation 事件仍有稳定 operation。
 */
const getPlanOperationFromArgs = (args: unknown): PlanOperationEvent['operation'] => {
  const action = args && typeof args === 'object' && 'action' in args ? args.action : undefined;

  if (action === 'set_plan' || action === 'add_steps' || action === 'update_steps') {
    return action;
  }

  return 'update_steps';
};

/**
 * 向 runtime 转发 agent-loop 事件。
 * runtime.emitEvent 是可选能力，统一经过这个 helper 让调用处保持简洁。
 */
const emitAgentLoopEvent = <TChildrenResponse = unknown>(
  runtime: AgentLoopRuntime<TChildrenResponse>,
  event: AgentLoopEvent
) => {
  runtime.emitEvent?.(event);
};

/**
 * 归一化并推送本轮 agent-loop usage。
 * 空 usage 不推送，避免 workflow 计费侧收到无意义记录。
 */
const pushAgentLoopUsages = <TChildrenResponse = unknown>(
  runtime: AgentLoopRuntime<TChildrenResponse>,
  usages?: Array<AgentLoopUsage | undefined>
) => {
  const normalizedUsages = normalizeAgentLoopUsages(usages);
  if (normalizedUsages.length > 0) {
    runtime.usagePush?.(normalizedUsages);
  }
};

/**
 * 移除外部传入的 system message。
 * fastAgent 模式由本文件统一生成主 Agent system prompt，避免多个 system prompt 叠加导致约束冲突。
 */
const stripSystemMessages = (messages: ChatCompletionMessageParam[]) =>
  messages.filter((message) => message.role !== ChatCompletionRequestMessageRoleEnum.System);

/**
 * 构建进入主 Agent 的初始消息链。
 * raw 模式完全尊重调用方传入的 messages；fastAgent 模式会注入平台主提示词并剔除外部 system。
 */
const buildInitialMessages = ({
  input,
  hasRuntimeTools,
  promptMode = 'fastAgent'
}: {
  input: FastAgentLoopInput;
  hasRuntimeTools: boolean;
  promptMode?: AgentLoopRuntime['promptMode'];
}): ChatCompletionMessageParam[] => {
  if (promptMode === 'raw') {
    return input.messages;
  }

  return [
    createSystemMessage(
      getMainAgentSystemPrompt({
        systemPrompt: input.systemPrompt,
        hasRuntimeTools
      })
    ),
    ...stripSystemMessages(input.messages)
  ];
};

/**
 * ask_user 暂停时保存恢复所需上下文。
 * 恢复后用户回答会作为同一个 ask tool_call 的 Tool message 追加，继续原消息链而不是开启新轮对话。
 */
const buildAskPendingContext = ({
  messages,
  call,
  assistantMessage,
  activePlan
}: {
  messages: ChatCompletionMessageParam[];
  call: ChatCompletionMessageToolCall;
  assistantMessage?: ChatCompletionMessageParam;
  activePlan?: AgentPlanType;
}): PendingMainContext => {
  const assistantFields =
    assistantMessage?.role === ChatCompletionRequestMessageRoleEnum.Assistant
      ? {
          ...(('content' in assistantMessage && assistantMessage.content
            ? { content: assistantMessage.content }
            : {}) as Pick<typeof assistantMessage, 'content'>),
          ...(assistantMessage.reasoning_content
            ? { reasoning_content: assistantMessage.reasoning_content }
            : {})
        }
      : {};

  return {
    messages: [
      ...messages,
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        ...assistantFields,
        tool_calls: [call]
      }
    ],
    askToolCallId: call.id,
    activePlan
  };
};

/**
 * 单主 Agent Loop。
 * Main Agent 在同一条消息链中直接使用 runtime tools、ask_user 和 update_plan；
 * answer/reasoning delta 和 plan 状态始终实时透传给前端。
 */
export const runFastAgentMainLoop = async <TChildrenResponse = unknown>({
  runtime,
  input
}: {
  runtime: AgentLoopRuntime<TChildrenResponse>;
  input: FastAgentLoopInput<TChildrenResponse>;
}): Promise<FastAgentLoopResult<TChildrenResponse>> => {
  // 格式化工具目录，保证后续 control/runtime/internal 工具集合都基于去重后的工具列表。
  const normalized = normalizeToolCatalog(runtime.toolCatalog);
  runtime = {
    ...runtime,
    toolCatalog: normalized
  };

  const hasRuntimeTools = normalized.runtimeTools.length > 0;

  let pendingAsk:
    | {
        ask: AgentAskPayload;
        askId: string;
        context: PendingMainContext;
      }
    | undefined;

  // ask_user 暂停时会把当时的 LLM messages 保存到 pendingMainContext。
  // 恢复时追加用户回答作为对应 ask tool 的 Tool message，延续同一条消息链。
  const messages =
    input.pendingMainContext && input.userAnswer !== undefined
      ? [
          ...input.pendingMainContext.messages,
          {
            role: ChatCompletionRequestMessageRoleEnum.Tool,
            tool_call_id: input.pendingMainContext.askToolCallId,
            content: normalizeToolResponseContent(input.userAnswer)
          } as ChatCompletionMessageParam
        ]
      : buildInitialMessages({ input, hasRuntimeTools, promptMode: runtime.promptMode });
  // 普通续轮通过 input.activePlan 恢复结构化 plan；ask_user 续跑则优先使用暂停时的完整快照。
  // 历史 checkpoint 只负责给模型提供上下文，不再作为运行时状态的反序列化来源。
  let activePlan = input.pendingMainContext?.activePlan ?? input.activePlan;
  // control 工具只影响 Agent 内部状态，不作为普通工具卡片向前端展示。
  // read_files/sandbox 是内置执行器，但需要走普通工具事件链路供前端和运行详情展示。
  const askToolName = runtime.toolCatalog.askTool?.function.name;
  const updatePlanToolName = runtime.toolCatalog.updatePlanTool?.function.name;
  const readFileToolName = runtime.toolCatalog.readFileTool?.function.name;
  const datasetSearchToolName = runtime.toolCatalog.datasetSearchTool?.function.name;
  const sandboxToolNames = new Set(
    (runtime.toolCatalog.sandboxTools ?? []).map((tool) => tool.function.name)
  );
  const controlToolNames = new Set([askToolName, updatePlanToolName].filter(Boolean));
  const internalToolNames = new Set(
    [
      askToolName,
      updatePlanToolName,
      readFileToolName,
      datasetSearchToolName,
      ...sandboxToolNames
    ].filter(Boolean)
  );
  const isSandboxSystemTool = (name: string) => sandboxToolNames.has(name);

  const result = await runAgentLoop({
    maxRunAgentTimes: runtime.maxRunAgentTimes ?? 100,
    batchToolSize: runtime.batchToolSize ?? 5,
    childrenInteractiveParams: input.childrenInteractiveParams,
    body: {
      model: runtime.model,
      reasoning_effort: runtime.reasoningEffort,
      stream: runtime.stream ?? true,
      temperature: runtime.temperature,
      max_tokens: runtime.maxTokens,
      top_p: runtime.topP,
      stop: runtime.stop,
      response_format: runtime.responseFormat,
      retainDatasetCite: runtime.retainDatasetCite,
      useVision: runtime.useVision,
      useAudio: runtime.useAudio,
      useVideo: runtime.useVideo,
      extractFiles: runtime.extractFiles,
      messages,
      tools: getToolsForFastAgentLoop({
        catalog: runtime.toolCatalog
      }),
      parallel_tool_calls: true
    },
    teamId: runtime.teamId,
    userKey: runtime.userKey,
    isAborted: runtime.checkIsStopping,
    getActivePlan: () => activePlan,
    // 内置工具会修改本地状态或依赖串行上下文，不能参与普通 runtime tool 的批量并发。
    canBatchTool: (call) => !internalToolNames.has(call.function.name),
    onReasoning: ({ text }) => runtime.emitEvent?.({ type: 'reasoning_delta', text }),
    onStreaming: ({ text }) => runtime.emitEvent?.({ type: 'answer_delta', text }),
    onAfterCompressContext: ({ usage, requestIds, seconds, contextCheckpoint }) => {
      pushAgentLoopUsages(runtime, [usage]);
      emitAgentLoopEvent(runtime, {
        type: 'after_message_compress',
        usages: normalizeAgentLoopUsages([usage]),
        requestIds,
        seconds,
        contextCheckpoint
      });
    },
    onLLMRequestStart: ({ requestIndex, modelName }) =>
      runtime.emitEvent?.({
        type: 'llm_request_start',
        requestIndex,
        modelName
      }),
    onLLMRequestEnd: ({
      requestIndex,
      modelName,
      requestId,
      finishReason,
      answerText,
      reasoningText,
      toolCalls,
      usage,
      seconds,
      error
    }) => {
      const agentCallUsage = usage
        ? {
            moduleName: AgentUsageModuleName.agentCall,
            model: modelName,
            totalPoints: usage.totalPoints,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens
          }
        : undefined;
      pushAgentLoopUsages(runtime, [agentCallUsage]);
      emitAgentLoopEvent(runtime, {
        type: 'llm_request_end',
        requestIndex,
        modelName,
        requestId,
        finishReason: finishReason ?? 'stop',
        answerText,
        reasoningText,
        toolCalls,
        usages: normalizeAgentLoopUsages([agentCallUsage]),
        seconds,
        error
      });
    },
    onToolCall: ({ call }) => {
      if (call.function.name === updatePlanToolName) {
        emitAgentLoopEvent(runtime, {
          type: 'plan_status',
          status: activePlan ? 'updating' : 'generating'
        });
      }

      if (controlToolNames.has(call.function.name)) return;

      emitAgentLoopEvent(runtime, { type: 'tool_call', call });
    },
    onToolParam: ({ call, argsDelta }) => {
      if (controlToolNames.has(call.function.name)) return;

      emitAgentLoopEvent(runtime, {
        type: 'tool_params',
        callId: call.id,
        argsDelta
      });
    },
    onToolRunStart: ({ call }) => {
      if (controlToolNames.has(call.function.name)) return;
      emitAgentLoopEvent(runtime, {
        type: 'tool_run_start',
        call
      });
    },
    onToolRunEnd: ({
      call,
      rawResponse,
      response,
      assistantMessages,
      seconds,
      errorMessage,
      usages,
      toolResponseCompress,
      metadata
    }) => {
      if (controlToolNames.has(call.function.name)) return;

      pushAgentLoopUsages(runtime, usages);
      emitAgentLoopEvent(runtime, {
        type: 'tool_run_end',
        call,
        rawResponse,
        response,
        assistantMessages,
        seconds,
        errorMessage,
        usages,
        toolResponseCompress,
        metadata
      });
    },
    onRunTool: async ({ call, messages, assistantMessage }) => {
      // 先处理会改变 agent-loop 本地状态的内置工具，再落到外部 runtime tool。
      if (call.function.name === askToolName) {
        const parsed = parseAgentAskToolCall(call);
        if (!parsed.success) {
          return createToolResponse(parsed.error, { skipResponseCompress: true });
        }

        emitAgentLoopEvent(runtime, {
          type: 'ask_start',
          ask: parsed.ask,
          id: call.id,
          params: call.function.arguments,
          seconds: 0
        });
        pendingAsk = {
          ask: parsed.ask,
          askId: call.id,
          context: buildAskPendingContext({
            messages,
            call,
            assistantMessage,
            activePlan
          })
        };

        return createToolResponse('Waiting for user answer.', {
          stop: true,
          skipResponseCompress: true
        });
      }

      if (call.function.name === updatePlanToolName) {
        const args = parseJsonArgs(call.function.arguments);
        const updateResult = applyPlanUpdate({
          plan: activePlan,
          update: args
        });

        if (updateResult.success) {
          activePlan = updateResult.plan;
          emitAgentLoopEvent(runtime, {
            type: 'plan_operation',
            operation: getPlanOperationFromArgs(args),
            success: true,
            message: updateResult.message,
            id: call.id,
            params: call.function.arguments,
            seconds: 0,
            plan: updateResult.plan
          });
        } else {
          emitAgentLoopEvent(runtime, {
            type: 'plan_operation',
            operation: getPlanOperationFromArgs(args),
            success: false,
            message: updateResult.message,
            id: call.id,
            params: call.function.arguments,
            seconds: 0
          });
        }

        return createToolResponse(updateResult.message, { skipResponseCompress: true });
      }

      if (isSandboxSystemTool(call.function.name)) {
        const sandboxToolName = toSandboxToolName(call.function.name);

        if (!runtime.sandboxToolContext) {
          const response = 'Sandbox executor is not available.';
          return createToolResponse(response, { skipResponseCompress: true });
        }

        const sandboxResult = await runSandboxTools({
          toolName: sandboxToolName,
          args: call.function.arguments ?? '',
          sandboxClient: runtime.sandboxToolContext.client
        });
        return createToolResponse(sandboxResult.response, {
          skipResponseCompress: true,
          errorMessage: sandboxResult.success ? undefined : sandboxResult.response
        });
      }

      if (call.function.name === readFileToolName) {
        if (!runtime.executeReadFileTool) {
          const response = 'Read file executor is not available.';
          return createToolResponse(response, { skipResponseCompress: true });
        }

        const fileResult = await runtime.executeReadFileTool({
          call,
          messages
        });

        return createToolResponse(fileResult.response, {
          usages: fileResult.usages,
          skipResponseCompress: true,
          errorMessage: fileResult.error ? getErrText(fileResult.error) : undefined,
          metadata: fileResult.metadata
        });
      }

      if (call.function.name === datasetSearchToolName) {
        if (!runtime.executeDatasetSearchTool) {
          const response = 'Dataset search executor is not available.';
          return createToolResponse(response, { skipResponseCompress: true });
        }

        const patchedArgs = patchDatasetSearchParams({
          args: call.function.arguments ?? '',
          currentInputFiles: runtime.datasetSearchCurrentInputFiles
        });
        const patchedCall = {
          ...call,
          function: {
            ...call.function,
            arguments: JSON.stringify(patchedArgs)
          }
        };
        const datasetResult = await runtime.executeDatasetSearchTool({
          call: patchedCall,
          messages
        });

        return createToolResponse(datasetResult.response, {
          usages: datasetResult.usages,
          skipResponseCompress: true,
          errorMessage: datasetResult.error ? getErrText(datasetResult.error) : undefined,
          metadata: datasetResult.metadata
        });
      }

      const toolResult = await runtime.executeTool({
        call,
        messages
      });

      return toolResult;
    },
    onRunInteractiveTool: async (params) => {
      return runtime.executeInteractiveTool
        ? await runtime.executeInteractiveTool(params)
        : createToolResponse<TChildrenResponse>(
            'Interactive tool is not supported in fastAgent loop yet.'
          );
    }
  });

  // 触发了 ask 模式
  if (pendingAsk) {
    return {
      status: 'paused',
      pause: {
        type: 'ask',
        ask: pendingAsk.ask,
        askId: pendingAsk.askId
      },
      activePlan,
      pendingMainContext: pendingAsk.context,
      completeMessages: result.completeMessages,
      assistantMessages: result.assistantMessages,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      llmTotalPoints: result.llmTotalPoints,
      finishReason: result.finish_reason,
      requestIds: result.requestIds,
      contextCheckpoint: result.contextCheckpoint
    };
  }

  // 用户 abort
  if (runtime.checkIsStopping?.()) {
    return {
      status: 'aborted',
      activePlan,
      completeMessages: result.completeMessages,
      assistantMessages: result.assistantMessages,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      llmTotalPoints: result.llmTotalPoints,
      finishReason: result.finish_reason,
      requestIds: result.requestIds,
      contextCheckpoint: result.contextCheckpoint
    };
  }

  if (result.toolChildPause) {
    return {
      status: 'paused',
      pause: {
        type: 'tool_child',
        childrenResponse: result.toolChildPause.childrenResponse,
        toolCallId: result.toolChildPause.toolCallId
      },
      activePlan,
      completeMessages: result.completeMessages,
      assistantMessages: result.assistantMessages,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      llmTotalPoints: result.llmTotalPoints,
      finishReason: result.finish_reason,
      requestIds: result.requestIds,
      contextCheckpoint: result.contextCheckpoint
    };
  }

  if (result.error) {
    return {
      status: 'error',
      error: result.error,
      activePlan,
      completeMessages: result.completeMessages,
      assistantMessages: result.assistantMessages,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      llmTotalPoints: result.llmTotalPoints,
      finishReason: result.finish_reason,
      requestIds: result.requestIds,
      contextCheckpoint: result.contextCheckpoint
    };
  }

  return {
    status: 'done',
    activePlan,
    completeMessages: result.completeMessages,
    assistantMessages: result.assistantMessages,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    llmTotalPoints: result.llmTotalPoints,
    finishReason: result.finish_reason,
    requestIds: result.requestIds,
    contextCheckpoint: result.contextCheckpoint
  };
};
