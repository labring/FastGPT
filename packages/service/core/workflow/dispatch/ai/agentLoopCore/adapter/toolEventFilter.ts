import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentLoopEvent } from '../../../../../ai/llm/agentLoop/domain/event';

export type AgentLoopCoreToolEventFilterPolicy = {
  /** 需要等完整调用参数到达后再决定是否对外发送事件的工具。 */
  shouldBuffer: (call: ChatCompletionMessageToolCall) => boolean;
  /** 返回 true 时，该工具调用的整组生命周期事件只供内部执行，不向外暴露。 */
  shouldDiscard: (call: ChatCompletionMessageToolCall) => boolean;
};

/**
 * 管理一次 AgentLoop 的工具展示过滤，统一缓冲事件和清理对外消息。
 * 策略由业务方注入；未配置时原样透传。过滤只影响展示与返回 transcript，
 * 不改变模型内部上下文、工具执行、暂停恢复或用量上报。
 */
export const createAgentLoopCoreToolEventFilter = ({
  policy,
  emitEvent: forwardEvent
}: {
  policy?: AgentLoopCoreToolEventFilterPolicy;
  emitEvent: (event: AgentLoopEvent) => void;
}) => {
  if (!policy) {
    return {
      emitEvent: forwardEvent,
      filterMessages: (messages: ChatCompletionMessageParam[]) => messages
    };
  }

  const bufferedToolEvents = new Map<string, AgentLoopEvent[]>();
  const discardedToolCallIds = new Set<string>();
  const discardedResultToolCallIds = new Set<string>();

  /** 成对移除内部工具调用及响应，保留同一 assistant 消息中的其他可见内容。 */
  const filterMessages = (messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] => {
    if (discardedResultToolCallIds.size === 0) return messages;

    return messages.flatMap((message) => {
      if (message.role === 'tool' && discardedResultToolCallIds.has(message.tool_call_id))
        return [];
      if (message.role !== 'assistant' || !message.tool_calls?.length) return [message];

      const visibleToolCalls = message.tool_calls.filter(
        (call) => !discardedResultToolCallIds.has(call.id)
      );
      if (visibleToolCalls.length > 0) return [{ ...message, tool_calls: visibleToolCalls }];

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

  /** 参数流在调用事件后才补齐，等到工具执行边界再决定是否释放整组事件。 */
  const emitEvent = (event: AgentLoopEvent) => {
    if (event.type === 'llm_request_end' && event.toolCalls?.length) {
      const visibleToolCalls = event.toolCalls.filter((call) => {
        const shouldDiscard = policy.shouldBuffer(call) && policy.shouldDiscard(call);
        if (shouldDiscard) discardedResultToolCallIds.add(call.id);
        return !shouldDiscard;
      });
      forwardEvent({ ...event, toolCalls: visibleToolCalls });
      return;
    }

    if (event.type === 'tool_call') {
      if (!policy.shouldBuffer(event.call)) {
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
      if (bufferedEvents === undefined && !policy.shouldBuffer(event.call)) {
        forwardEvent(event);
        return;
      }

      if (policy.shouldDiscard(event.call)) {
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

  return { emitEvent, filterMessages };
};
