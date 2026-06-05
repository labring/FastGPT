import type {
  AIChatItemValueItemType,
  ToolModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import type { AgentLoopEvent } from '../../../../../ai/llm/agentLoop';
import type { WorkflowResponseType } from '../../../type';
import type { GetSubAppInfoFnType } from '../type';

const AGENT_PLAN_STREAM_RESPONSE_ID = 'agent-plan-stream';

/**
 * 判断工具是否为 loop 内部控制工具。
 * 内部工具只驱动 loop 状态，不应作为普通工具调用暴露给前端。
 */
const isInternalTool = (name: string, internalToolNames: Set<string>) =>
  internalToolNames.has(name);

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

/**
 * 将通用 agent loop 事件映射为 workflow SSE 和 assistantResponses。
 * 只有 main_agent 可见文本会流给用户；plan_update 和外部工具调用会同步写入
 * assistantResponses，保证刷新页面后仍能从 records 恢复计划卡片和工具运行记录。
 */
export const createWorkflowAgentLoopEventMapper = ({
  workflowStreamResponse,
  getSubAppInfo,
  internalToolNames,
  updatePlanToolName,
  askToolName,
  showReasoning = true,
  assistantResponses = []
}: {
  workflowStreamResponse?: WorkflowResponseType;
  getSubAppInfo: GetSubAppInfoFnType;
  internalToolNames: Set<string>;
  updatePlanToolName?: string;
  askToolName?: string;
  showReasoning?: boolean;
  assistantResponses?: AIChatItemValueItemType[];
}) => {
  const toolNameByCallId = new Map<string, string>();
  let currentAssistantTextIndex: number | undefined;
  let answerDeltaText = '';
  let reasoningDeltaText = '';

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
    !value.agentStopGate &&
    !value.contextCheckpoint &&
    !value.tool;

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

  /**
   * 根据 callId 找到已经持久化的工具运行卡片。
   */
  const findToolResponseIndex = (callId: string) =>
    assistantResponses.findIndex((item) => item.tools?.some((tool) => tool.id === callId));

  /**
   * 在 tools 数组中按 id 覆盖已有工具；不存在时追加到末尾。
   */
  const replaceOrAppendTool = (
    tools: ToolModuleResponseItemType[] | null | undefined,
    tool: ToolModuleResponseItemType
  ) => {
    if (!tools?.length) return [tool];

    const hasTool = tools.some((item) => item.id === tool.id);
    return hasTool ? tools.map((item) => (item.id === tool.id ? tool : item)) : tools.concat(tool);
  };

  /**
   * 新建或更新工具运行卡片。
   * tool_call 到达时先创建卡片，后续 tool_params/tool_run_end 再按 callId 追加内容。
   */
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

  /**
   * 增量更新已持久化的工具卡片。
   * 若事件顺序异常导致尚未创建卡片，则忽略该增量，避免生成缺少名称/参数的脏记录。
   */
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

  const findAgentPlanUpdateIndex = (callId: string) =>
    assistantResponses.findIndex((item) => item.agentPlanUpdate?.id === callId);

  const upsertAgentPlanUpdate = (
    update: NonNullable<AIChatItemValueItemType['agentPlanUpdate']>
  ) => {
    currentAssistantTextIndex = undefined;
    const responseIndex = findAgentPlanUpdateIndex(update.id);
    if (responseIndex < 0) {
      assistantResponses.push({
        id: update.id,
        agentPlanUpdate: update
      });
      return;
    }

    assistantResponses[responseIndex] = {
      ...assistantResponses[responseIndex],
      agentPlanUpdate: {
        ...(assistantResponses[responseIndex].agentPlanUpdate || {}),
        ...update
      }
    };
  };

  const findAgentAskIndex = (callId: string) =>
    assistantResponses.findIndex((item) => item.agentAsk?.id === callId);

  const upsertAgentAsk = (ask: NonNullable<AIChatItemValueItemType['agentAsk']>) => {
    currentAssistantTextIndex = undefined;
    const responseIndex = findAgentAskIndex(ask.id);
    if (responseIndex < 0) {
      assistantResponses.push({
        id: ask.id,
        agentAsk: ask
      });
      return;
    }

    assistantResponses[responseIndex] = {
      ...assistantResponses[responseIndex],
      agentAsk: {
        ...(assistantResponses[responseIndex].agentAsk || {}),
        ...ask
      }
    };
  };

  const upsertAssistantValueById = (value: AIChatItemValueItemType) => {
    if (!value.id) {
      assistantResponses.push(value);
      currentAssistantTextIndex = undefined;
      return;
    }

    const responseIndex = assistantResponses.findIndex((item) => item.id === value.id);
    if (responseIndex < 0) {
      assistantResponses.push(value);
    } else {
      assistantResponses[responseIndex] = {
        ...assistantResponses[responseIndex],
        ...value
      };
    }
    currentAssistantTextIndex = undefined;
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
    /*
     * 只处理“本轮 LLM 结束于工具调用”的 assistant 内容归属。
     *
     * 例子：
     *   request 1: reasoningText="需要先查时间", assistantText=undefined, toolCalls=[call_time]
     *   request 2: reasoningText="工具返回了时间", assistantText="现在是 10 点"
     *
     * request 1 没有可见回答，但 reasoning 仍然属于 call_time 前的 assistant turn。
     * 所以这里把 assistant 输出作为独立 value 插到对应工具卡片之前；历史恢复时再合并为同一条
     * assistant tool_calls 消息，不把文本/思考挂到工具卡片自身。
     */
    const runtimeToolCalls = toolCalls.filter((call) => {
      const functionName = call.function.name;
      return functionName && !isInternalTool(functionName, internalToolNames);
    });
    if (!runtimeToolCalls.length) return false;

    const runtimeToolCallIds = new Set(runtimeToolCalls.map((call) => call.id));
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

  const applyToolParams = ({ callId, argsDelta }: { callId: string; argsDelta: string }) => {
    const functionName = toolNameByCallId.get(callId);
    if (!functionName || isInternalTool(functionName, internalToolNames)) return;

    updateToolResponse(callId, (tool) => ({
      ...tool,
      params: appendUniqueDelta(tool.params, argsDelta)
    }));

    workflowStreamResponse?.({
      id: callId,
      event: SseResponseEventEnum.toolParams,
      data: {
        tool: {
          id: callId,
          params: argsDelta
        }
      }
    });
  };

  const applyToolResponse = ({ callId, response }: { callId: string; response: string }) => {
    const functionName = toolNameByCallId.get(callId);
    if (!functionName || isInternalTool(functionName, internalToolNames)) return;

    updateToolResponse(callId, (tool) => ({
      ...tool,
      response: appendUniqueDelta(tool.response, response)
    }));

    workflowStreamResponse?.({
      id: callId,
      event: SseResponseEventEnum.toolResponse,
      data: {
        tool: {
          id: callId,
          response
        }
      }
    });
  };

  /**
   * 处理单个 loop event，并按事件类型决定是否转发给前端或写入 assistantResponses。
   */
  const emitEvent = (event: AgentLoopEvent) => {
    switch (event.type) {
      case 'answer_delta': {
        appendAnswerDelta(event.text);
        workflowStreamResponse?.({
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            text: event.text
          })
        });
        return;
      }
      case 'reasoning_delta': {
        appendReasoningDelta(event.text);
        if (!showReasoning) return;

        workflowStreamResponse?.({
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            reasoning_content: event.text
          })
        });
        return;
      }
      case 'llm_request_start': {
        answerDeltaText = '';
        reasoningDeltaText = '';
        currentAssistantTextIndex = undefined;
        workflowStreamResponse?.({
          event: SseResponseEventEnum.flowNodeStatus,
          data: {
            status: 'running',
            name: event.modelName
          }
        });
        return;
      }
      case 'llm_request_end': {
        const assistantText = getUnstreamedText(answerDeltaText, event.answerText);
        const reasoningText = getUnstreamedText(reasoningDeltaText, event.reasoningText);

        const closeAssistantOutputContext = () => {
          answerDeltaText = '';
          reasoningDeltaText = '';
          currentAssistantTextIndex = undefined;
        };

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
          closeAssistantOutputContext();
          return;
        }
        appendAssistantOutput({
          assistantText,
          reasoningText
        });
        closeAssistantOutputContext();
        return;
      }
      case 'after_message_compress': {
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
        if (isInternalTool(functionName, internalToolNames)) return;
        toolNameByCallId.set(event.call.id, functionName);

        const subApp = getSubAppInfo(functionName);
        const tool: ToolModuleResponseItemType = {
          id: event.call.id,
          toolName: subApp?.name || functionName,
          toolAvatar: subApp?.avatar || '',
          functionName,
          params
        };
        upsertToolResponse(tool);

        workflowStreamResponse?.({
          id: event.call.id,
          event: SseResponseEventEnum.toolCall,
          data: {
            tool
          }
        });
        return;
      }
      case 'tool_params': {
        applyToolParams({
          callId: event.callId,
          argsDelta: event.argsDelta
        });
        return;
      }
      case 'tool_run_end': {
        applyToolResponse({
          callId: event.call.id,
          response: event.response
        });
        return;
      }
      case 'assistant_push': {
        upsertAssistantValueById(event.value);
        return;
      }
      case 'plan_status': {
        workflowStreamResponse?.({
          id: AGENT_PLAN_STREAM_RESPONSE_ID,
          event: SseResponseEventEnum.planStatus,
          data: {
            planStatus: {
              status: event.status
            }
          }
        });
        return;
      }
      case 'plan_operation': {
        if (!event.id) return;
        upsertAgentPlanUpdate({
          id: event.id,
          functionName: updatePlanToolName || 'update_plan',
          params: event.params || '',
          response: event.message
        });
        return;
      }
      case 'ask_start': {
        if (!event.id) return;
        upsertAgentAsk({
          id: event.id,
          askId: event.id,
          functionName: askToolName || 'ask_user',
          params: event.params || ''
        });
        return;
      }
      case 'plan_update': {
        const nextPlanValue: AIChatItemValueItemType = {
          plan: event.plan
        };
        const planIndex = assistantResponses.findIndex(
          (item) => item.plan?.planId && item.plan.planId === event.plan.planId
        );
        if (planIndex >= 0) {
          assistantResponses[planIndex] = {
            ...assistantResponses[planIndex],
            ...nextPlanValue
          };
        } else {
          assistantResponses.push(nextPlanValue);
        }

        workflowStreamResponse?.({
          id: AGENT_PLAN_STREAM_RESPONSE_ID,
          event: SseResponseEventEnum.plan,
          data: {
            plan: event.plan
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
