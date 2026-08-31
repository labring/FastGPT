import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type {
  AgentLoopEvent,
  AgentLoopInput,
  AgentLoopProviderName,
  AgentLoopRuntime
} from '../../../../../ai/llm/agentLoop/interface';
import { runAgentLoop } from '../../../../../ai/llm/agentLoop/interface';
import { createAgentLoopCoreAssistantEventCollector } from '../adapter/assistantResponses';
import { summarizeAgentLoopCoreResult, type AgentLoopCoreOutputSummary } from './output/result';
import { compactAgentLoopCorePlanSnapshots } from './output/assistantResponses';
import type { AgentLoopCoreResult } from '../domain/result';
import type { AgentLoopCoreToolDisplayInfo } from '../domain/toolInfo';

export type RunAgentLoopCoreParams<TChildrenResponse = unknown> = {
  provider?: AgentLoopProviderName;
  input: AgentLoopInput<TChildrenResponse>;
  runtime: AgentLoopRuntime<TChildrenResponse>;
  bufferedToolEventFilter?: {
    /** 需要等完整调用参数到达后再决定是否对外发送事件的工具。 */
    shouldBuffer: (call: ChatCompletionMessageToolCall) => boolean;
    /** 返回 true 时，该工具调用的整组生命周期事件只供内部执行，不向外暴露。 */
    shouldDiscard: (call: ChatCompletionMessageToolCall) => boolean;
  };
  assistantResponses?: {
    extraResponses?: AIChatItemValueItemType[];
    eventTarget?: AIChatItemValueItemType[];
    showReasoning?: boolean;
    getEventToolInfo?: (name: string) => AgentLoopCoreToolDisplayInfo | undefined;
    metaEventNames?: {
      setPlanToolName?: string;
      updatePlanToolName?: string;
      askToolName?: string;
    };
  };
};

/** 从对外 transcript 中成对移除内部工具调用及其响应，避免后续总结再次暴露内部错误。 */
const discardToolMessages = (
  messages: ChatCompletionMessageParam[],
  discardedToolCallIds: Set<string>
): ChatCompletionMessageParam[] => {
  if (discardedToolCallIds.size === 0) return messages;

  return messages.flatMap((message) => {
    if (message.role === 'tool' && discardedToolCallIds.has(message.tool_call_id)) return [];
    if (message.role !== 'assistant' || !message.tool_calls?.length) return [message];

    const visibleToolCalls = message.tool_calls.filter(
      (call) => !discardedToolCallIds.has(call.id)
    );
    if (visibleToolCalls.length > 0) {
      return [{ ...message, tool_calls: visibleToolCalls }];
    }

    const { tool_calls: _toolCalls, ...messageWithoutToolCalls } = message;
    const hasOtherAssistantOutput =
      message.content !== null && message.content !== undefined
        ? true
        : Boolean(
            message.reasoning_content ||
            message.interactive ||
            message.audio ||
            message.function_call ||
            message.refusal
          );
    return hasOtherAssistantOutput ? [messageWithoutToolCalls] : [];
  });
};

/**
 * Workflow dispatch 侧统一运行 agent-loop 的核心入口。
 *
 * 底层 `runAgentLoop` 只负责模型循环语义；core 在这一层统一补齐 workflow/chat
 * 需要的稳定字段，并从标准事件维护可持久化的 assistantResponses。
 * eventTarget 可让调用方复用已有数组；不传时由 core 创建本轮独立容器。
 */
export const runAgentLoopCore = async <TChildrenResponse = unknown>({
  provider,
  input,
  runtime,
  bufferedToolEventFilter,
  assistantResponses
}: RunAgentLoopCoreParams<TChildrenResponse>): Promise<AgentLoopCoreResult<TChildrenResponse>> => {
  const eventAssistantResponses = assistantResponses?.eventTarget ?? [];
  const assistantEventCollector = createAgentLoopCoreAssistantEventCollector({
    assistantResponses: eventAssistantResponses,
    showReasoning: assistantResponses?.showReasoning,
    getToolInfo: assistantResponses?.getEventToolInfo,
    metaEventNames: assistantResponses?.metaEventNames
  });
  const forwardEvent = (event: AgentLoopEvent) => {
    assistantEventCollector.emitEvent(event);
    runtime.emitEvent?.(event);
  };
  const bufferedToolEvents = new Map<string, AgentLoopEvent[]>();
  const discardedToolCallIds = new Set<string>();
  const discardedResultToolCallIds = new Set<string>();

  /**
   * 工具参数可能在 `tool_call` 之后才流式补齐。候选工具先缓冲到 `tool_run_start`，
   * 再用完整参数判断整组事件应当转发还是仅保留在 agent-loop 内部。
   */
  const emitEvent = (event: AgentLoopEvent) => {
    if (!bufferedToolEventFilter) {
      forwardEvent(event);
      return;
    }

    if (event.type === 'llm_request_end' && event.toolCalls?.length) {
      const visibleToolCalls = event.toolCalls.filter((call) => {
        const shouldDiscard =
          bufferedToolEventFilter.shouldBuffer(call) && bufferedToolEventFilter.shouldDiscard(call);
        if (shouldDiscard) discardedResultToolCallIds.add(call.id);
        return !shouldDiscard;
      });
      forwardEvent({
        ...event,
        toolCalls: visibleToolCalls
      });
      return;
    }

    if (event.type === 'tool_call') {
      if (!bufferedToolEventFilter.shouldBuffer(event.call)) {
        forwardEvent(event);
        return;
      }
      bufferedToolEvents.set(event.call.id, [event]);
      return;
    }

    if (event.type === 'tool_params') {
      if (discardedToolCallIds.has(event.callId)) return;

      const bufferedEvents = bufferedToolEvents.get(event.callId);
      if (bufferedEvents) {
        bufferedEvents.push(event);
        return;
      }
      forwardEvent(event);
      return;
    }

    if (event.type === 'tool_run_start' || event.type === 'tool_run_end') {
      const callId = event.call.id;
      if (discardedToolCallIds.has(callId)) {
        if (event.type === 'tool_run_end') discardedToolCallIds.delete(callId);
        return;
      }

      const bufferedEvents = bufferedToolEvents.get(callId);
      const isBufferedTool =
        bufferedEvents !== undefined || bufferedToolEventFilter.shouldBuffer(event.call);
      if (!isBufferedTool) {
        forwardEvent(event);
        return;
      }

      if (bufferedToolEventFilter.shouldDiscard(event.call)) {
        bufferedToolEvents.delete(callId);
        discardedResultToolCallIds.add(callId);
        if (event.type === 'tool_run_start') discardedToolCallIds.add(callId);
        return;
      }

      bufferedEvents?.forEach(forwardEvent);
      bufferedToolEvents.delete(callId);
      forwardEvent(event);
      return;
    }

    forwardEvent(event);
  };

  const wrappedRuntime: AgentLoopRuntime<TChildrenResponse> = {
    ...runtime,
    emitEvent
  };
  const result = await runAgentLoop<TChildrenResponse>({
    provider,
    input,
    runtime: wrappedRuntime
  });
  const publicResult = {
    ...result,
    completeMessages: discardToolMessages(result.completeMessages, discardedResultToolCallIds),
    assistantMessages: discardToolMessages(result.assistantMessages, discardedResultToolCallIds)
  };
  const assistantResponseValues = compactAgentLoopCorePlanSnapshots([
    ...(assistantResponses?.extraResponses ?? []),
    ...eventAssistantResponses
  ]);

  if (publicResult.status === 'paused') {
    return {
      ...publicResult,
      status: 'interactive',
      assistantResponses: assistantResponseValues
    };
  }

  return {
    ...publicResult,
    assistantResponses: assistantResponseValues
  };
};

export type RunAgentLoopCoreWithSummaryParams<TChildrenResponse = unknown> =
  RunAgentLoopCoreParams<TChildrenResponse>;

export type AgentLoopCoreRunWithSummaryResult<TChildrenResponse = unknown> = {
  result: AgentLoopCoreResult<TChildrenResponse>;
  summary: AgentLoopCoreOutputSummary<TChildrenResponse>;
};

/**
 * 运行 agent-loop core 并返回 workflow 节点常用的输出摘要。
 *
 * Workflow Agent 和 ToolCall 都需要同一组 summary 字段：requestIds、token/points、
 * assistantResponses、interactive、error/finalText 等。统一放在 core 中，避免外层重复
 * 了解 AgentLoopCoreResult 的内部结构。
 */
export const runAgentLoopCoreWithSummary = async <TChildrenResponse = unknown>({
  ...params
}: RunAgentLoopCoreWithSummaryParams<TChildrenResponse>): Promise<
  AgentLoopCoreRunWithSummaryResult<TChildrenResponse>
> => {
  const result = await runAgentLoopCore(params);

  return {
    result,
    summary: summarizeAgentLoopCoreResult(result)
  };
};
