import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { parseJsonArgs } from '../../../../../utils';
import { runAgentLoop } from './base';
import { getMainAgentSystemPrompt } from '../prompt/mainPrompt';
import { parseAgentAskToolCall } from '../../../systemTools/ask';
import { applyPlanUpdate } from '../../../systemTools/plan';
import type { AgentLoopEvent } from './type';
import { normalizeAgentLoopUsages, type AgentLoopUsage } from '../../../type';
import { runStopGate } from '../stop';
import { getToolsForFastAgentLoop, normalizeToolCatalog } from '../tools';
import { toSandboxToolName } from '../../../systemTools/sandbox';
import { AgentUsageModuleName } from '../../../constants';
import type {
  AgentLoopRuntime,
  AgentLoopToolExecutionResult,
  FastAgentLoopInput,
  FastAgentLoopResult,
  PendingMainContext
} from './type';
import { shouldRequirePlanFromMessages } from '../../../systemTools/plan';
import { getSandboxToolInfo, runSandboxTools } from '../../../../../sandbox/toolCall';

/**
 * 从最终 assistantMessages 中提取可作为回答落库的文本。
 * 带 tool_calls 的 assistant 轮次只是工具选择过程，内容已经通过事件流展示，不应并入最终答案。
 */
const getTextFromMessages = (messages: ChatCompletionMessageParam[]) =>
  messages
    .map((message) => {
      if (message.role !== 'assistant' || !message.content) return '';
      // answerText 表示本轮最终答案；工具调用轮的 content 已通过事件流透出，但不合并进最终答案。
      if (message.tool_calls?.length) return '';
      if (typeof message.content === 'string') return message.content;
      return message.content.map((item) => (item.type === 'text' ? item.text : '')).join('');
    })
    .join('');

/**
 * 从最终 assistantMessages 中提取 reasoning 文本。
 * 与 answerText 保持同样边界：工具调用轮的 reasoning 属于中间过程，不写入最终 reasoningSummary。
 */
const getReasoningFromMessages = (messages: ChatCompletionMessageParam[]) =>
  messages
    .map((message) => {
      if (message.role !== 'assistant' || !message.reasoning_content) return '';
      // 与 answerText 保持一致：工具调用轮的 reasoning 可通过事件流透出，但不合并进最终 reasoning。
      if (message.tool_calls?.length) return '';
      return message.reasoning_content;
    })
    .join('');

/**
 * 将单条 LLM message 的多模态文本片段归一成纯文本。
 * 当前主要用于 stop gate 反馈，保证反馈消息不依赖 content 的具体存储形态。
 */
const getMessageText = (message?: ChatCompletionMessageParam) => {
  if (!message || !('content' in message) || !message.content) return '';
  if (typeof message.content === 'string') return message.content;
  return message.content.map((item) => (item.type === 'text' ? item.text : '')).join('');
};

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

/**
 * 生成 stop gate 拒绝停止时的隐藏 assistant 记录。
 * 该记录用于事件流和恢复诊断，不作为用户可见回答展示。
 */
const createStopGateAssistantValue = ({
  id,
  reason,
  feedback
}: {
  id: string;
  reason: string;
  feedback: string;
}): AIChatItemValueItemType => ({
  id,
  agentStopGate: {
    id,
    reason,
    feedback
  },
  hideInUI: true
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
  activePlan,
  requirePlan,
  runtimeToolCalledSinceLastPlanUpdate
}: {
  messages: ChatCompletionMessageParam[];
  call: ChatCompletionMessageToolCall;
  activePlan?: AgentPlanType;
  requirePlan?: boolean;
  runtimeToolCalledSinceLastPlanUpdate?: boolean;
}): PendingMainContext => ({
  messages: [
    ...messages,
    {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      tool_calls: [call]
    }
  ],
  askToolCallId: call.id,
  activePlan,
  requirePlan,
  runtimeToolCalledSinceLastPlanUpdate
});

/**
 * 单主 Agent Loop。
 * Main Agent 在同一条消息链中直接使用 runtime tools、ask_user 和 update_plan；
 * plan 是否完成由本地 stop gate 在每轮无工具调用后兜底检查。
 * answer/reasoning delta 始终实时透传给前端；stop gate 只影响最终可持久化的 assistantMessages。
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

  let activePlan = input.pendingMainContext?.activePlan ?? input.activePlan;
  let pendingAsk:
    | {
        ask: FastAgentLoopResult<TChildrenResponse>['ask'];
        askId: string;
        context: PendingMainContext;
      }
    | undefined;
  let runtimeToolCalledSinceLastPlanUpdate =
    input.pendingMainContext?.runtimeToolCalledSinceLastPlanUpdate ?? false;
  let stopGateRejections = 0;
  const maxStopGateRejections = runtime.maxStopGateRejections ?? 2;
  const requirePlan =
    input.pendingMainContext?.requirePlan ?? shouldRequirePlanFromMessages(input.messages);

  // 计划已满足 stop gate 后，本轮只允许模型输出答案，不再继续选择工具。
  const canForceFinalAnswerOnly = () => {
    if (!activePlan) return false;

    return runStopGate({
      activePlan,
      requirePlan,
      runtimeToolCalledSinceLastPlanUpdate
    }).allowStop;
  };

  // ask_user 暂停时会把当时的 LLM messages 保存到 pendingMainContext。
  // 恢复时追加用户回答作为对应 ask tool 的 Tool message，延续同一条消息链。
  const messages =
    input.pendingMainContext && input.userAnswer !== undefined
      ? [
          ...input.pendingMainContext.messages,
          {
            role: ChatCompletionRequestMessageRoleEnum.Tool,
            tool_call_id: input.pendingMainContext.askToolCallId,
            content: input.userAnswer || ''
          } as ChatCompletionMessageParam
        ]
      : buildInitialMessages({ input, hasRuntimeTools, promptMode: runtime.promptMode });
  // control 工具只影响 Agent 内部状态，不作为普通工具卡片向前端展示。
  // read_files/sandbox 是内置执行器，但需要走普通工具事件链路供前端和运行详情展示。
  const askToolName = runtime.toolCatalog.askTool?.function.name;
  const updatePlanToolName = runtime.toolCatalog.updatePlanTool?.function.name;
  const readFileToolName = runtime.toolCatalog.readFileTool?.function.name;
  const sandboxToolNames = new Set(
    (runtime.toolCatalog.sandboxTools ?? []).map((tool) => tool.function.name)
  );
  const controlToolNames = new Set([askToolName, updatePlanToolName].filter(Boolean));
  const internalToolNames = new Set(
    [askToolName, updatePlanToolName, readFileToolName, ...sandboxToolNames].filter(Boolean)
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
    userKey: runtime.userKey,
    isAborted: runtime.checkIsStopping,
    getRequestControl: () => {
      const forceFinalAnswerOnly = canForceFinalAnswerOnly();

      return {
        toolChoice: forceFinalAnswerOnly ? 'none' : 'auto'
      };
    },
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
        finishReason,
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
      seconds,
      errorMessage,
      usages,
      toolResponseCompress,
      nodeResponse
    }) => {
      if (controlToolNames.has(call.function.name)) return;

      pushAgentLoopUsages(runtime, usages);
      emitAgentLoopEvent(runtime, {
        type: 'tool_run_end',
        call,
        rawResponse,
        response,
        seconds,
        errorMessage,
        usages,
        toolResponseCompress,
        nodeResponse
      });
    },
    onRunTool: async ({ call, messages }) => {
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
            activePlan,
            requirePlan,
            runtimeToolCalledSinceLastPlanUpdate
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
          runtimeToolCalledSinceLastPlanUpdate = false;
          emitAgentLoopEvent(runtime, {
            type: 'plan_update',
            plan: activePlan
          });
        }

        emitAgentLoopEvent(runtime, {
          type: 'plan_operation',
          operation: getPlanOperationFromArgs(args),
          success: updateResult.success,
          message: updateResult.message,
          id: call.id,
          params: call.function.arguments,
          seconds: 0,
          plan: updateResult.success ? updateResult.plan : undefined
        });

        return createToolResponse(updateResult.message, { skipResponseCompress: true });
      }

      if (isSandboxSystemTool(call.function.name)) {
        const sandboxToolName = toSandboxToolName(call.function.name);
        const startedAt = Date.now();

        if (!runtime.sandboxToolContext) {
          const response = 'Sandbox executor is not available.';
          return createToolResponse(response, { skipResponseCompress: true });
        }

        const sandboxResult = await runSandboxTools({
          toolName: sandboxToolName,
          args: call.function.arguments ?? '',
          sandboxClient: runtime.sandboxToolContext.client
        });
        const seconds = +((Date.now() - startedAt) / 1000).toFixed(2);
        const sandboxInfo = getSandboxToolInfo(sandboxToolName, runtime.lang);
        const nodeResponse = {
          id: call.id,
          nodeId: call.id,
          moduleType: FlowNodeTypeEnum.tool,
          moduleName: sandboxInfo?.name || sandboxToolName,
          moduleLogo: sandboxInfo?.avatar,
          toolId: sandboxToolName,
          toolInput: sandboxResult.input,
          toolRes: sandboxResult.response,
          runningTime: seconds
        };

        return createToolResponse(sandboxResult.response, {
          skipResponseCompress: true,
          errorMessage: sandboxResult.success ? undefined : sandboxResult.response,
          nodeResponse
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

        pushAgentLoopUsages(runtime, fileResult.usages);

        return createToolResponse(fileResult.response, {
          usages: fileResult.usages,
          skipResponseCompress: true,
          errorMessage: fileResult.error ? getErrText(fileResult.error) : undefined,
          nodeResponse: fileResult.nodeResponse
        });
      }

      // 外部业务工具执行后，需要重新经过 plan 更新或 stop gate 检查，不能直接结束。
      runtimeToolCalledSinceLastPlanUpdate = true;
      const toolResult = await runtime.executeTool({
        call,
        messages
      });

      return toolResult;
    },
    onRunInteractiveTool: async (params) => {
      const result = runtime.executeInteractiveTool
        ? await runtime.executeInteractiveTool(params)
        : createToolResponse<TChildrenResponse>(
            'Interactive tool is not supported in fastAgent loop yet.'
          );
      pushAgentLoopUsages(runtime, result.usages);
      return result;
    },
    onStopCandidate: async ({ requestIndex, requestId, requestMessages }) => {
      if (!updatePlanToolName) {
        return { allowStop: true };
      }

      const gate = runStopGate({
        activePlan,
        requirePlan,
        runtimeToolCalledSinceLastPlanUpdate
      });

      if (gate.allowStop) {
        return { allowStop: true };
      }

      stopGateRejections++;
      if (stopGateRejections > maxStopGateRejections) {
        return {
          allowStop: false,
          error: `Active plan is not complete after ${stopGateRejections} stop checks.`
        };
      }

      // 拒绝停止时把反馈作为隐藏 assistant 事件发出，让前端和恢复链路能看到模型被要求继续的原因。
      const stopGateId = `stop_gate_${requestIndex}_${requestId}`;
      runtime.emitEvent?.({
        type: 'assistant_push',
        value: createStopGateAssistantValue({
          id: stopGateId,
          reason: gate.reason,
          feedback: getMessageText(gate.feedbackMessage)
        })
      });

      return {
        allowStop: false,
        feedbackMessage: gate.feedbackMessage
      };
    }
  });

  // 触发了 ask 模式
  if (pendingAsk) {
    return {
      status: 'ask',
      ask: pendingAsk.ask,
      askId: pendingAsk.askId,
      activePlan,
      pendingMainContext: pendingAsk.context,
      completeMessages: result.completeMessages,
      assistantMessages: result.assistantMessages,
      interactiveResponse: result.interactiveResponse,
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
      interactiveResponse: result.interactiveResponse,
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
      interactiveResponse: result.interactiveResponse,
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
    answerText: getTextFromMessages(result.assistantMessages),
    reasoningText: getReasoningFromMessages(result.assistantMessages),
    activePlan,
    completeMessages: result.completeMessages,
    assistantMessages: result.assistantMessages,
    interactiveResponse: result.interactiveResponse,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    llmTotalPoints: result.llmTotalPoints,
    finishReason: result.finish_reason,
    requestIds: result.requestIds,
    contextCheckpoint: result.contextCheckpoint
  };
};
