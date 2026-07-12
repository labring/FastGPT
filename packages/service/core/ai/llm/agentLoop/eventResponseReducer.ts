import type {
  AIChatItemValueItemType,
  ToolModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import {
  createAgentLoopControlToolResponseStore,
  updateAgentLoopToolResponse,
  upsertAgentLoopToolResponse
} from './assistantToolResponse';
import type { AgentLoopEvent } from './loop/type';

type AgentLoopEventByType<T extends AgentLoopEvent['type']> = Extract<AgentLoopEvent, { type: T }>;
type ToolCallEvent = AgentLoopEventByType<'tool_call'>;
type ToolParamsEvent = AgentLoopEventByType<'tool_params'>;
type ToolResponseEvent = AgentLoopEventByType<'tool_response'>;

type AgentLoopEventResponseCallbacks = {
  onAnswerDelta?: (event: AgentLoopEventByType<'answer_delta'>) => void;
  onReasoningDelta?: (event: AgentLoopEventByType<'reasoning_delta'>) => void;
  onLlmRequestStart?: (event: AgentLoopEventByType<'llm_request_start'>) => void;
  onLlmRequestEnd?: (event: AgentLoopEventByType<'llm_request_end'>) => void;
  onAfterMessageCompress?: (event: AgentLoopEventByType<'after_message_compress'>) => void;
  onRuntimeToolCall?: (params: { event: ToolCallEvent; tool: ToolModuleResponseItemType }) => void;
  onRuntimeToolParams?: (event: ToolParamsEvent) => void;
  onRuntimeToolResponse?: (event: ToolResponseEvent) => void;
  onControlToolResponse?: (event: ToolResponseEvent) => void;
  onPlanStatus?: (event: AgentLoopEventByType<'plan_status'>) => void;
  onPlanUpdate?: (event: AgentLoopEventByType<'plan_update'>) => void;
};

/**
 * 归约 Agent Loop 事件中的可持久化聊天状态。
 *
 * workflow 与 auxiliary generation 共享工具卡、计划、追问和 checkpoint 的状态规则；
 * 场景相关的 SSE 与 nodeResponse 通过 callbacks 输出，避免公共层依赖 workflow。
 */
export const createAgentLoopEventResponseReducer = ({
  assistantResponses = [],
  updatePlanToolName,
  askToolName,
  showReasoning = true,
  isRuntimeTool,
  createRuntimeTool,
  toolResponseMode = 'append',
  dedupeToolResponses = false,
  callbacks = {}
}: {
  assistantResponses?: AIChatItemValueItemType[];
  updatePlanToolName?: string;
  askToolName?: string;
  showReasoning?: boolean;
  isRuntimeTool: (functionName: string) => boolean;
  createRuntimeTool: (event: ToolCallEvent) => ToolModuleResponseItemType;
  toolResponseMode?: 'append' | 'replace';
  dedupeToolResponses?: boolean;
  callbacks?: AgentLoopEventResponseCallbacks;
}) => {
  const toolNameByCallId = new Map<string, string>();
  const handledToolResponseIds = new Set<string>();
  const isUpdatePlanTool = (name?: string) => !!name && name === updatePlanToolName;
  const isAskTool = (name?: string) => !!name && name === askToolName;
  const { upsertPlanUpdate, updatePlanUpdate, upsertAsk, updateAsk } =
    createAgentLoopControlToolResponseStore(assistantResponses);

  /** 将工具调用前的文本和 reasoning 放回对应工具卡之前，保证刷新后消息顺序稳定。 */
  const insertAssistantTextBeforeRuntimeTools = ({
    toolCalls,
    assistantText,
    reasoningText
  }: {
    toolCalls: AgentLoopEventByType<'llm_request_end'>['toolCalls'];
    assistantText?: string;
    reasoningText?: string;
  }) => {
    const runtimeToolCalls = (toolCalls ?? []).filter((call) => isRuntimeTool(call.function.name));
    if (!runtimeToolCalls.length) return;

    const runtimeToolCallIds = new Set(runtimeToolCalls.map((call) => call.id));
    const existingIndex = assistantResponses.findIndex((item) =>
      item.tools?.some((tool) => runtimeToolCallIds.has(tool.id))
    );

    if (!assistantText) {
      if (!reasoningText || existingIndex < 0) return;

      const currentValue = assistantResponses[existingIndex];
      assistantResponses[existingIndex] = {
        ...currentValue,
        reasoning: {
          content: [currentValue.reasoning?.content, reasoningText].filter(Boolean).join('\n\n')
        },
        ...(!showReasoning ? { hideReason: true } : {})
      };
      return;
    }

    const insertIndex = existingIndex >= 0 ? existingIndex : assistantResponses.length;
    assistantResponses.splice(insertIndex, 0, {
      text: { content: assistantText },
      ...(reasoningText
        ? {
            reasoning: { content: reasoningText },
            ...(!showReasoning ? { hideReason: true } : {})
          }
        : {})
    });
  };

  /** 处理单个 Agent Loop 事件，并在状态更新后触发场景回调。 */
  const emitEvent = (event: AgentLoopEvent) => {
    switch (event.type) {
      case 'answer_delta': {
        callbacks.onAnswerDelta?.(event);
        return;
      }
      case 'reasoning_delta': {
        if (showReasoning) {
          callbacks.onReasoningDelta?.(event);
        }
        return;
      }
      case 'llm_request_start': {
        callbacks.onLlmRequestStart?.(event);
        return;
      }
      case 'llm_request_end': {
        callbacks.onLlmRequestEnd?.(event);
        event.toolCalls?.forEach((call) => {
          if (isUpdatePlanTool(call.function.name)) {
            updatePlanUpdate(call.id, (update) => ({
              ...update,
              ...(event.answerText ? { assistantText: event.answerText } : {}),
              ...(event.reasoningText ? { reasoningText: event.reasoningText } : {})
            }));
          }
          if (isAskTool(call.function.name)) {
            updateAsk(call.id, (ask) => ({
              ...ask,
              ...(event.answerText ? { assistantText: event.answerText } : {}),
              ...(event.reasoningText ? { reasoningText: event.reasoningText } : {})
            }));
          }
        });
        insertAssistantTextBeforeRuntimeTools({
          toolCalls: event.toolCalls,
          assistantText: event.answerText,
          reasoningText: event.reasoningText
        });
        return;
      }
      case 'after_message_compress': {
        callbacks.onAfterMessageCompress?.(event);
        if (event.contextCheckpoint) {
          assistantResponses.push({
            contextCheckpoint: event.contextCheckpoint,
            hideInUI: true
          });
        }
        return;
      }
      case 'tool_call': {
        const functionName = event.call.function.name;
        const params = event.call.function.arguments ?? '';
        toolNameByCallId.set(event.call.id, functionName);

        if (isUpdatePlanTool(functionName)) {
          upsertPlanUpdate({ id: event.call.id, functionName, params });
          return;
        }
        if (isAskTool(functionName)) {
          upsertAsk({ id: event.call.id, functionName, params });
          return;
        }
        if (!isRuntimeTool(functionName)) return;

        const tool = createRuntimeTool(event);
        upsertAgentLoopToolResponse({ assistantResponses, tool });
        callbacks.onRuntimeToolCall?.({ event, tool });
        return;
      }
      case 'tool_params': {
        const functionName = toolNameByCallId.get(event.callId);
        if (isUpdatePlanTool(functionName)) {
          updatePlanUpdate(event.callId, (update) => ({
            ...update,
            params: `${update.params ?? ''}${event.argsDelta}`
          }));
          return;
        }
        if (isAskTool(functionName)) {
          updateAsk(event.callId, (ask) => ({
            ...ask,
            params: `${ask.params ?? ''}${event.argsDelta}`
          }));
          return;
        }
        if (!functionName || !isRuntimeTool(functionName)) return;

        updateAgentLoopToolResponse({
          assistantResponses,
          callId: event.callId,
          updater: (tool) => ({
            ...tool,
            params: `${tool.params ?? ''}${event.argsDelta}`
          })
        });
        callbacks.onRuntimeToolParams?.(event);
        return;
      }
      case 'tool_response': {
        if (dedupeToolResponses && handledToolResponseIds.has(event.call.id)) return;
        handledToolResponseIds.add(event.call.id);

        const functionName = event.call.function.name;
        if (isUpdatePlanTool(functionName)) {
          updatePlanUpdate(event.call.id, (update) => ({
            ...update,
            response: `${update.response ?? ''}${event.response}`
          }));
          callbacks.onControlToolResponse?.(event);
          return;
        }
        if (isAskTool(functionName)) {
          callbacks.onControlToolResponse?.(event);
          return;
        }
        if (!isRuntimeTool(functionName)) return;

        updateAgentLoopToolResponse({
          assistantResponses,
          callId: event.call.id,
          updater: (tool) => ({
            ...tool,
            response:
              toolResponseMode === 'append'
                ? `${tool.response ?? ''}${event.response}`
                : event.response
          })
        });
        callbacks.onRuntimeToolResponse?.(event);
        return;
      }
      case 'plan_status': {
        callbacks.onPlanStatus?.(event);
        return;
      }
      case 'plan_update': {
        const planIndex = assistantResponses.findIndex(
          (item) => item.plan?.planId && item.plan.planId === event.plan.planId
        );
        if (planIndex >= 0) {
          assistantResponses[planIndex] = {
            ...assistantResponses[planIndex],
            plan: event.plan
          };
        } else {
          assistantResponses.push({ plan: event.plan });
        }
        callbacks.onPlanUpdate?.(event);
        return;
      }
      case 'stop_gate_feedback': {
        assistantResponses.push({
          id: event.id,
          agentStopGate: {
            id: event.id,
            reason: event.reason,
            feedback: event.feedback,
            ...(event.assistantText ? { assistantText: event.assistantText } : {}),
            ...(event.reasoningText ? { reasoningText: event.reasoningText } : {})
          }
        });
        return;
      }
    }
  };

  return {
    assistantResponses,
    emitEvent
  };
};
