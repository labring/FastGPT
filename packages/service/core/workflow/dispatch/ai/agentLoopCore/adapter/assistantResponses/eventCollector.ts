import type {
  AIChatItemValueItemType,
  ToolModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import type { AgentLoopEvent } from '../../../../../../ai/llm/agentLoop/interface';
import {
  appendAgentLoopCoreAssistantResponseFromEvent,
  type AgentLoopCoreAssistantMetaEventNames
} from './fromEvents';
import { buildAgentLoopCoreAssistantResponsesFromMessages } from './fromMessages';
import type { AgentLoopCoreToolDisplayInfo } from '../../domain/toolInfo';

export type CreateAgentLoopCoreAssistantEventCollectorParams = {
  assistantResponses?: AIChatItemValueItemType[];
  showReasoning?: boolean;
  getToolInfo?: (name: string) => AgentLoopCoreToolDisplayInfo | undefined;
  metaEventNames?: AgentLoopCoreAssistantMetaEventNames;
};

const appendUniqueDelta = (current: string | null | undefined, delta: string) => {
  const currentValue = current || '';
  if (!delta || currentValue === delta) return currentValue;
  return `${currentValue}${delta}`;
};

const getUnstreamedText = (streamedText: string, finalText?: string) => {
  if (!finalText) return undefined;
  if (!streamedText) return finalText;
  if (finalText === streamedText) return undefined;
  return finalText.startsWith(streamedText) ? finalText.slice(streamedText.length) : undefined;
};

const isPlainAssistantOutput = (value?: AIChatItemValueItemType) =>
  !!value &&
  !value.id &&
  !value.tools?.length &&
  !value.skills?.length &&
  !value.interactive &&
  !value.plan &&
  !value.planStatus &&
  !value.agentPlanUpdate &&
  !value.agentAsk &&
  !value.contextCheckpoint &&
  !value.tool;

/**
 * 创建 agent-loop 事件到 assistantResponses 的增量收集器。
 *
 * 这个 collector 只负责可持久化聊天上下文，不处理 SSE 和 nodeResponse。
 * 成功的 plan_operation 保存最新完整计划供 UI 刷新恢复；plan_status 仍是纯流式状态。
 */
export const createAgentLoopCoreAssistantEventCollector = ({
  assistantResponses = [],
  showReasoning = true,
  getToolInfo,
  metaEventNames
}: CreateAgentLoopCoreAssistantEventCollectorParams = {}) => {
  const toolNameByCallId = new Map<string, string>();
  const completedLlmRequestIds = new Set<string>();
  const completedToolCallIds = new Set<string>();
  const storedCheckpointKeys = new Set<string>();
  let currentAssistantTextIndex: number | undefined;
  let answerDeltaText = '';
  let reasoningDeltaText = '';

  const ensureCurrentAssistantTextValue = () => {
    if (
      currentAssistantTextIndex !== undefined &&
      isPlainAssistantOutput(assistantResponses[currentAssistantTextIndex])
    ) {
      return currentAssistantTextIndex;
    }

    assistantResponses.push({});
    currentAssistantTextIndex = assistantResponses.length - 1;
    return currentAssistantTextIndex;
  };

  const appendAnswerDelta = (text: string) => {
    if (!text) return;
    const index = ensureCurrentAssistantTextValue();
    const currentValue = assistantResponses[index];
    if (!currentValue.reasoning?.content && reasoningDeltaText) {
      assistantResponses[index] = {
        ...currentValue,
        reasoning: {
          content: reasoningDeltaText
        },
        ...(!showReasoning ? { hideReason: true } : {})
      };
    }
    const latestValue = assistantResponses[index];
    answerDeltaText += text;
    assistantResponses[index] = {
      ...latestValue,
      text: {
        content: `${latestValue.text?.content || ''}${text}`
      }
    };
  };

  const appendReasoningDelta = (text: string) => {
    if (!text) return;
    reasoningDeltaText += text;
    const index = ensureCurrentAssistantTextValue();
    const currentValue = assistantResponses[index];
    assistantResponses[index] = {
      ...currentValue,
      reasoning: {
        content: `${currentValue.reasoning?.content || ''}${text}`
      },
      ...(!showReasoning ? { hideReason: true } : {})
    };
  };

  const appendAssistantOutput = ({
    assistantText,
    reasoningText,
    insertIndex
  }: {
    assistantText?: string;
    reasoningText?: string;
    insertIndex?: number;
  }) => {
    if (!assistantText && !reasoningText) return;

    if (
      currentAssistantTextIndex !== undefined &&
      isPlainAssistantOutput(assistantResponses[currentAssistantTextIndex]) &&
      (insertIndex === undefined || currentAssistantTextIndex <= insertIndex)
    ) {
      const currentValue = assistantResponses[currentAssistantTextIndex];
      assistantResponses[currentAssistantTextIndex] = {
        ...currentValue,
        ...(assistantText
          ? {
              text: {
                content: `${currentValue.text?.content || ''}${assistantText}`
              }
            }
          : {}),
        ...(reasoningText
          ? {
              reasoning: {
                content: `${currentValue.reasoning?.content || ''}${reasoningText}`
              },
              ...(!showReasoning ? { hideReason: true } : {})
            }
          : {})
      };
      return;
    }

    const value: AIChatItemValueItemType = {
      ...(assistantText
        ? {
            text: {
              content: assistantText
            }
          }
        : {}),
      ...(reasoningText
        ? {
            reasoning: {
              content: reasoningText
            },
            ...(!showReasoning ? { hideReason: true } : {})
          }
        : {})
    };

    if (typeof insertIndex === 'number') {
      assistantResponses.splice(insertIndex, 0, value);
      currentAssistantTextIndex = insertIndex;
      return;
    }

    assistantResponses.push(value);
    currentAssistantTextIndex = assistantResponses.length - 1;
  };

  const findToolResponseIndex = (callId: string) =>
    assistantResponses.findIndex((item) => item.tools?.some((tool) => tool.id === callId));

  const replaceOrAppendTool = (
    tools: ToolModuleResponseItemType[] | null | undefined,
    tool: ToolModuleResponseItemType
  ) => {
    if (!tools?.length) return [tool];

    const hasTool = tools.some((item) => item.id === tool.id);
    return hasTool ? tools.map((item) => (item.id === tool.id ? tool : item)) : tools.concat(tool);
  };

  const upsertToolResponse = (tool: ToolModuleResponseItemType) => {
    const responseIndex = findToolResponseIndex(tool.id);
    if (responseIndex < 0) {
      assistantResponses.push({
        id: tool.id,
        tools: [tool]
      });
      return;
    }

    const currentValue = assistantResponses[responseIndex];
    assistantResponses[responseIndex] = {
      ...currentValue,
      tools: replaceOrAppendTool(currentValue.tools, tool)
    };
  };

  const updateToolResponse = (
    callId: string,
    updater: (tool: ToolModuleResponseItemType) => ToolModuleResponseItemType
  ) => {
    const responseIndex = findToolResponseIndex(callId);
    if (responseIndex < 0) return;

    const currentValue = assistantResponses[responseIndex];
    const currentTool = currentValue.tools?.find((tool) => tool.id === callId);
    if (!currentTool) return;

    const nextTool = updater(currentTool);
    assistantResponses[responseIndex] = {
      ...currentValue,
      tools: replaceOrAppendTool(currentValue.tools, nextTool)
    };
  };

  const appendMetaAssistantResponse = (
    event: Extract<
      AgentLoopEvent,
      {
        type: 'after_message_compress' | 'plan_operation' | 'ask_start';
      }
    >
  ) => {
    currentAssistantTextIndex = undefined;
    appendAgentLoopCoreAssistantResponseFromEvent({
      assistantResponses,
      event,
      names: metaEventNames
    });
  };

  const insertAssistantTextBeforeRuntimeTools = ({
    toolCalls,
    assistantText,
    reasoningText
  }: {
    toolCalls: NonNullable<Extract<AgentLoopEvent, { type: 'llm_request_end' }>['toolCalls']>;
    assistantText?: string;
    reasoningText?: string;
  }) => {
    if (!toolCalls.length) return false;

    const runtimeToolCallIds = new Set(toolCalls.map((call) => call.id));
    const existingIndex = assistantResponses.findIndex((item) =>
      item.tools?.some((tool) => runtimeToolCallIds.has(tool.id))
    );
    const insertIndex = existingIndex >= 0 ? existingIndex : assistantResponses.length;
    appendAssistantOutput({
      assistantText,
      reasoningText,
      insertIndex
    });
    return true;
  };

  const emitEvent = (event: AgentLoopEvent) => {
    switch (event.type) {
      case 'answer_delta':
        appendAnswerDelta(event.text);
        return;
      case 'reasoning_delta':
        appendReasoningDelta(event.text);
        return;
      case 'llm_request_start':
        answerDeltaText = '';
        reasoningDeltaText = '';
        currentAssistantTextIndex = undefined;
        return;
      case 'llm_request_end': {
        if (completedLlmRequestIds.has(event.requestId)) return;
        completedLlmRequestIds.add(event.requestId);

        const assistantText = getUnstreamedText(answerDeltaText, event.answerText);
        const reasoningText = getUnstreamedText(reasoningDeltaText, event.reasoningText);

        if (event.toolCalls?.length) {
          const handledByRuntimeTool = insertAssistantTextBeforeRuntimeTools({
            toolCalls: event.toolCalls,
            assistantText,
            reasoningText
          });
          if (!handledByRuntimeTool) {
            appendAssistantOutput({
              assistantText,
              reasoningText
            });
          }
        } else {
          appendAssistantOutput({
            assistantText,
            reasoningText
          });
        }

        answerDeltaText = '';
        reasoningDeltaText = '';
        currentAssistantTextIndex = undefined;
        return;
      }
      case 'after_message_compress': {
        const checkpointKey = event.requestIds.join(',') || event.contextCheckpoint;
        if (checkpointKey && storedCheckpointKeys.has(checkpointKey)) return;
        if (checkpointKey) storedCheckpointKeys.add(checkpointKey);
        appendMetaAssistantResponse(event);
        return;
      }
      case 'tool_call': {
        const functionName = event.call.function.name;
        toolNameByCallId.set(event.call.id, functionName);

        const toolInfo = getToolInfo?.(functionName);
        upsertToolResponse({
          id: event.call.id,
          toolName: toolInfo?.name || functionName,
          toolAvatar: toolInfo?.avatar || '',
          functionName,
          params: event.call.function.arguments ?? ''
        });
        return;
      }
      case 'tool_params': {
        const functionName = toolNameByCallId.get(event.callId);
        if (!functionName) return;

        updateToolResponse(event.callId, (tool) => ({
          ...tool,
          params: appendUniqueDelta(tool.params, event.argsDelta)
        }));
        return;
      }
      case 'tool_run_end': {
        if (completedToolCallIds.has(event.call.id)) return;
        completedToolCallIds.add(event.call.id);

        const functionName = toolNameByCallId.get(event.call.id) || event.call.function.name;

        if (findToolResponseIndex(event.call.id) < 0) {
          const toolInfo = getToolInfo?.(functionName);
          upsertToolResponse({
            id: event.call.id,
            toolName: toolInfo?.name || functionName,
            toolAvatar: toolInfo?.avatar || '',
            functionName,
            params: event.call.function.arguments ?? '',
            response: event.response
          });
        } else {
          updateToolResponse(event.call.id, (tool) => ({
            ...tool,
            response: appendUniqueDelta(tool.response, event.response)
          }));
        }

        if (event.assistantMessages?.length) {
          const childAssistantResponses = buildAgentLoopCoreAssistantResponsesFromMessages({
            messages: event.assistantMessages,
            reserveTool: true,
            reserveReason: true,
            getToolInfo
          }).map((value) =>
            !showReasoning && value.reasoning
              ? {
                  ...value,
                  hideReason: true
                }
              : value
          );
          assistantResponses.push(...childAssistantResponses);
          currentAssistantTextIndex = undefined;
        }
        return;
      }
      case 'plan_operation':
        appendMetaAssistantResponse(event);
        return;
      case 'ask_start':
        appendMetaAssistantResponse(event);
        return;
      case 'plan_status':
        return;
    }
  };

  return {
    assistantResponses,
    emitEvent
  };
};
