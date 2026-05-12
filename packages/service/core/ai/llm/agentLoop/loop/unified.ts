import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { parseJsonArgs } from '../../../utils';
import { runAgentLoop } from './base';
import { getMainAgentSystemPrompt } from '../prompt/mainPrompt';
import { parsePlanAskToolCall } from '../plan/parser';
import { applyPlanUpdate } from '../plan/state';
import { runStopGate } from '../stop';
import { getToolsForUnifiedLoop, normalizeToolCatalog } from '../tools';
import type {
  AgentLoopRuntime,
  AgentLoopToolExecutionResult,
  PendingMainContext,
  UnifiedAgentLoopInput,
  UnifiedAgentLoopResult
} from './type';
import { shouldRequirePlanFromMessages } from '../plan/requirePlan';

const MAIN_PROFILE = 'main_agent' as const;

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

const getReasoningFromMessages = (messages: ChatCompletionMessageParam[]) =>
  messages
    .map((message) => {
      if (message.role !== 'assistant' || !message.reasoning_content) return '';
      // 与 answerText 保持一致：工具调用轮的 reasoning 可通过事件流透出，但不合并进最终 reasoning。
      if (message.tool_calls?.length) return '';
      return message.reasoning_content;
    })
    .join('');

const getMessageText = (message?: ChatCompletionMessageParam) => {
  if (!message || !('content' in message) || !message.content) return '';
  if (typeof message.content === 'string') return message.content;
  return message.content.map((item) => (item.type === 'text' ? item.text : '')).join('');
};

const createToolResponse = (
  response: string,
  extra?: Partial<AgentLoopToolExecutionResult>
): AgentLoopToolExecutionResult => ({
  response,
  assistantMessages: [],
  usages: [],
  ...extra
});

const createSystemMessage = (content: string): ChatCompletionMessageParam => ({
  role: ChatCompletionRequestMessageRoleEnum.System,
  content
});

const stripSystemMessages = (messages: ChatCompletionMessageParam[]) =>
  messages.filter((message) => message.role !== ChatCompletionRequestMessageRoleEnum.System);

/**
 * 运行详情里展示的 agent 名称。
 * 同一个单主 loop 内，第一轮请求负责理解用户输入和选择动作，始终记录为 Master Agent；
 * 后续如果请求只是在维护计划/追问，则展示为 Plan Agent，方便运行详情线性区分阶段。
 */
const getDisplayAgentName = ({
  requestIndex,
  toolCalls,
  askToolName,
  updatePlanToolName
}: {
  requestIndex: number;
  toolCalls?: ChatCompletionMessageToolCall[];
  askToolName?: string;
  updatePlanToolName?: string;
}) => {
  if (requestIndex === 1) return 'Master Agent';

  const toolNames = new Set(toolCalls?.map((call) => call.function.name) ?? []);
  const isPlanAction =
    (!!updatePlanToolName && toolNames.has(updatePlanToolName)) ||
    (!!askToolName && toolNames.has(askToolName));

  return isPlanAction ? 'Plan Agent' : 'Master Agent';
};

const buildInitialMessages = ({
  runtime,
  input
}: {
  runtime: AgentLoopRuntime;
  input: UnifiedAgentLoopInput;
}): ChatCompletionMessageParam[] => [
  createSystemMessage(
    getMainAgentSystemPrompt({
      systemPrompt: input.systemPrompt,
      hasRuntimeTools: runtime.toolCatalog.runtimeTools.length > 0
    })
  ),
  ...stripSystemMessages(input.messages)
];

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
 * Main Agent 在同一条消息链中直接使用 runtime tools、ask_agent 和 update_plan；
 * plan 是否完成由本地 stop gate 在最终回答前兜底检查。
 */
export const runUnifiedAgentLoop = async ({
  runtime,
  input
}: {
  runtime: AgentLoopRuntime;
  input: UnifiedAgentLoopInput;
}): Promise<UnifiedAgentLoopResult> => {
  // 格式化 tools，会移除重复的
  const normalized = normalizeToolCatalog(runtime.toolCatalog);
  normalized.warnings.forEach((message) => runtime.emitEvent?.({ type: 'warning', message }));
  runtime = {
    ...runtime,
    toolCatalog: normalized.catalog
  };

  let activePlan = input.pendingMainContext?.activePlan ?? input.activePlan;
  let pendingAsk:
    | {
        ask: UnifiedAgentLoopResult['ask'];
        context: PendingMainContext;
      }
    | undefined;
  let runtimeToolCalledSinceLastPlanUpdate =
    input.pendingMainContext?.runtimeToolCalledSinceLastPlanUpdate ?? false;
  let stopGateRejections = 0;
  const maxStopGateRejections = runtime.maxStopGateRejections ?? 2;
  const requirePlan =
    input.pendingMainContext?.requirePlan ?? shouldRequirePlanFromMessages(input.messages);

  // 判断是否需要强制结束本轮对话
  const canStreamFinalAnswerNow = () => {
    if (!activePlan) return false;

    return runStopGate({
      activePlan,
      requirePlan,
      runtimeToolCalledSinceLastPlanUpdate
    }).allowStop;
  };

  // ask_agent 暂停时会把当时的 LLM messages 保存到 pendingMainContext。
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
      : buildInitialMessages({ runtime, input });

  runtime.emitEvent?.({ type: 'profile_start', profile: MAIN_PROFILE });

  const result = await runAgentLoop({
    maxRunAgentTimes: runtime.maxRunAgentTimes ?? 100,
    body: {
      model: runtime.model,
      stream: runtime.stream ?? true,
      useVision: runtime.useVision,
      messages,
      tools: getToolsForUnifiedLoop({
        catalog: runtime.toolCatalog
      }),
      parallel_tool_calls: true
    },
    userKey: runtime.userKey,
    usagePush: (usages) => runtime.usageSink?.(usages),
    isAborted: runtime.checkIsStopping,
    getRequestControl: () => {
      const streamFinalAnswer = canStreamFinalAnswerNow();

      return {
        toolChoice: streamFinalAnswer ? 'none' : 'auto'
      };
    },
    onReasoning: ({ text }) =>
      runtime.emitEvent?.({ type: 'reasoning_delta', profile: MAIN_PROFILE, text }),
    onStreaming: ({ text }) =>
      runtime.emitEvent?.({ type: 'answer_delta', profile: MAIN_PROFILE, text }),
    onAfterCompressContext: ({ usage, requestIds, seconds }) =>
      runtime.emitEvent?.({
        type: 'child_llm_request_end',
        profile: MAIN_PROFILE,
        usage,
        requestIds,
        seconds
      }),
    onAfterToolResponseCompress: ({ usage, requestIds }) =>
      runtime.emitEvent?.({
        type: 'child_llm_request_end',
        profile: MAIN_PROFILE,
        usage,
        requestIds
      }),
    onLLMRequestStart: ({ requestIndex, modelName }) =>
      runtime.emitEvent?.({
        type: 'llm_request_start',
        profile: MAIN_PROFILE,
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
      const updatePlanToolName = runtime.toolCatalog.updatePlanTool?.function.name;
      const askToolName = runtime.toolCatalog.askTool?.function.name;
      const agentName = getDisplayAgentName({
        requestIndex,
        toolCalls,
        askToolName,
        updatePlanToolName
      });

      runtime.emitEvent?.({
        type: 'llm_request_end',
        profile: MAIN_PROFILE,
        requestIndex,
        modelName,
        agentName,
        requestId,
        finishReason,
        answerText,
        reasoningText,
        toolCalls,
        usage,
        seconds,
        error
      });
    },
    onToolCall: ({ call }) => {
      const updatePlanToolName = runtime.toolCatalog.updatePlanTool?.function.name;
      if (call.function.name === updatePlanToolName) {
        runtime.emitEvent?.({
          type: 'plan_status',
          status: activePlan ? 'updating' : 'generating'
        });
      }

      runtime.emitEvent?.({ type: 'tool_call', profile: MAIN_PROFILE, call });
    },
    onToolParam: ({ call, argsDelta }) =>
      runtime.emitEvent?.({
        type: 'tool_params',
        profile: MAIN_PROFILE,
        callId: call.id,
        argsDelta
      }),
    onRunTool: async ({ call, messages }) => {
      const askToolName = runtime.toolCatalog.askTool?.function.name;
      const updatePlanToolName = runtime.toolCatalog.updatePlanTool?.function.name;

      if (call.function.name === askToolName) {
        const parsed = parsePlanAskToolCall(call);
        if (!parsed.success) {
          return createToolResponse(parsed.error);
        }

        pendingAsk = {
          ask: parsed.ask,
          context: buildAskPendingContext({
            messages,
            call,
            activePlan,
            requirePlan,
            runtimeToolCalledSinceLastPlanUpdate
          })
        };

        return createToolResponse('Waiting for user answer.', { stop: true });
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
          runtime.emitEvent?.({
            type: 'plan_update',
            plan: activePlan
          });
        }

        runtime.emitEvent?.({
          type: 'tool_response',
          profile: MAIN_PROFILE,
          callId: call.id,
          response: updateResult.message
        });

        return createToolResponse(updateResult.message);
      }

      runtimeToolCalledSinceLastPlanUpdate = true;
      const toolResult = await runtime.executeTool({
        profile: MAIN_PROFILE,
        call,
        messages
      });

      runtime.emitEvent?.({
        type: 'tool_response',
        profile: MAIN_PROFILE,
        callId: call.id,
        response: toolResult.response
      });

      return toolResult;
    },
    onRunInteractiveTool: async () =>
      createToolResponse('Interactive tool is not supported in unified agent loop yet.'),
    onStopCandidate: async ({ requestIndex, requestId, requestMessages }) => {
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

      const rejectedAssistant = requestMessages[requestMessages.length - 1];
      const stopGateId = `stop_gate_${requestIndex}_${requestId}`;
      runtime.emitEvent?.({
        type: 'stop_gate_feedback',
        profile: MAIN_PROFILE,
        id: stopGateId,
        reason: gate.reason,
        feedback: getMessageText(gate.feedbackMessage),
        ...(rejectedAssistant?.role === ChatCompletionRequestMessageRoleEnum.Assistant
          ? {
              assistantText: getMessageText(rejectedAssistant),
              reasoningText: rejectedAssistant.reasoning_content
            }
          : {})
      });

      return {
        allowStop: false,
        feedbackMessage: gate.feedbackMessage
      };
    }
  });

  runtime.emitEvent?.({
    type: 'profile_end',
    profile: MAIN_PROFILE,
    requestIds: result.requestIds
  });

  // 触发了 ask 模式
  if (pendingAsk) {
    return {
      status: 'ask',
      ask: pendingAsk.ask,
      activePlan,
      pendingMainContext: pendingAsk.context,
      completeMessages: result.completeMessages,
      assistantMessages: result.assistantMessages,
      requestIds: result.requestIds
    };
  }

  // 用户 abort
  if (runtime.checkIsStopping?.()) {
    return {
      status: 'aborted',
      activePlan,
      completeMessages: result.completeMessages,
      assistantMessages: result.assistantMessages,
      requestIds: result.requestIds
    };
  }

  if (result.error) {
    return {
      status: 'error',
      error: result.error,
      activePlan,
      completeMessages: result.completeMessages,
      assistantMessages: result.assistantMessages,
      requestIds: result.requestIds
    };
  }

  return {
    status: 'done',
    answerText: getTextFromMessages(result.assistantMessages),
    reasoningText: getReasoningFromMessages(result.assistantMessages),
    activePlan,
    completeMessages: result.completeMessages,
    assistantMessages: result.assistantMessages,
    requestIds: result.requestIds
  };
};
