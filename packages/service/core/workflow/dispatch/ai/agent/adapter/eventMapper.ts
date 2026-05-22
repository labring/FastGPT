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
  const isUpdatePlanTool = (name?: string) => !!name && name === updatePlanToolName;
  const isAskTool = (name?: string) => !!name && name === askToolName;

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
   * tool_call 到达时先创建卡片，后续 tool_params/tool_response 再按 callId 追加内容。
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

  const updateAgentPlanUpdate = (
    callId: string,
    updater: (
      update: NonNullable<AIChatItemValueItemType['agentPlanUpdate']>
    ) => NonNullable<AIChatItemValueItemType['agentPlanUpdate']>
  ) => {
    const responseIndex = findAgentPlanUpdateIndex(callId);
    const currentValue = responseIndex >= 0 ? assistantResponses[responseIndex] : undefined;
    if (!currentValue?.agentPlanUpdate) return;

    assistantResponses[responseIndex] = {
      ...currentValue,
      agentPlanUpdate: updater(currentValue.agentPlanUpdate)
    };
  };

  const findAgentAskIndex = (callId: string) =>
    assistantResponses.findIndex((item) => item.agentAsk?.id === callId);

  const upsertAgentAsk = (ask: NonNullable<AIChatItemValueItemType['agentAsk']>) => {
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

  const updateAgentAsk = (
    callId: string,
    updater: (
      ask: NonNullable<AIChatItemValueItemType['agentAsk']>
    ) => NonNullable<AIChatItemValueItemType['agentAsk']>
  ) => {
    const responseIndex = findAgentAskIndex(callId);
    const currentValue = responseIndex >= 0 ? assistantResponses[responseIndex] : undefined;
    if (!currentValue?.agentAsk) return;

    assistantResponses[responseIndex] = {
      ...currentValue,
      agentAsk: updater(currentValue.agentAsk)
    };
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
     * 如果不挂到对应 tools value 上，刷新后/下一轮上下文会只剩 tool，丢失第一段思考。
     */
    const runtimeToolCalls = toolCalls.filter((call) => {
      const functionName = call.function.name;
      return (
        functionName &&
        !isUpdatePlanTool(functionName) &&
        !isAskTool(functionName) &&
        !isInternalTool(functionName, internalToolNames)
      );
    });
    if (!runtimeToolCalls.length) return;

    const runtimeToolCallIds = new Set(runtimeToolCalls.map((call) => call.id));
    const existingIndex = assistantResponses.findIndex((item) =>
      item.tools?.some((tool) => runtimeToolCallIds.has(tool.id))
    );

    if (!assistantText) {
      // reason -> tool：没有 answerText 可单独插入时，把 reasoning 按 callId 挂到已创建的工具卡。
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

    const assistantValue: AIChatItemValueItemType = {
      text: { content: assistantText },
      ...(reasoningText
        ? {
            reasoning: { content: reasoningText },
            ...(!showReasoning ? { hideReason: true } : {})
          }
        : {})
    };
    assistantResponses.splice(insertIndex, 0, assistantValue);
  };

  const applyToolParams = ({ callId, argsDelta }: { callId: string; argsDelta: string }) => {
    const functionName = toolNameByCallId.get(callId);
    if (isUpdatePlanTool(functionName)) {
      updateAgentPlanUpdate(callId, (update) => ({
        ...update,
        params: `${update.params || ''}${argsDelta}`
      }));
      return;
    }
    if (isAskTool(functionName)) {
      updateAgentAsk(callId, (ask) => ({
        ...ask,
        params: `${ask.params || ''}${argsDelta}`
      }));
      return;
    }
    if (!functionName || isInternalTool(functionName, internalToolNames)) return;

    updateToolResponse(callId, (tool) => ({
      ...tool,
      params: `${tool.params || ''}${argsDelta}`
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
    if (isUpdatePlanTool(functionName)) {
      updateAgentPlanUpdate(callId, (update) => ({
        ...update,
        response: `${update.response || ''}${response}`
      }));
      return;
    }
    if (!functionName || isInternalTool(functionName, internalToolNames)) return;

    updateToolResponse(callId, (tool) => ({
      ...tool,
      response: `${tool.response || ''}${response}`
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
        workflowStreamResponse?.({
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            text: event.text
          })
        });
        return;
      }
      case 'reasoning_delta': {
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
        event.toolCalls?.forEach((call) => {
          if (isUpdatePlanTool(call.function.name)) {
            updateAgentPlanUpdate(call.id, (update) => ({
              ...update,
              ...(event.answerText ? { assistantText: event.answerText } : {}),
              ...(event.reasoningText ? { reasoningText: event.reasoningText } : {})
            }));
          }
          if (isAskTool(call.function.name)) {
            updateAgentAsk(call.id, (ask) => ({
              ...ask,
              ...(event.answerText ? { assistantText: event.answerText } : {}),
              ...(event.reasoningText ? { reasoningText: event.reasoningText } : {})
            }));
          }
        });
        if (event.toolCalls?.length) {
          insertAssistantTextBeforeRuntimeTools({
            toolCalls: event.toolCalls,
            assistantText: event.answerText,
            reasoningText: event.reasoningText
          });
        }
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
        toolNameByCallId.set(event.call.id, functionName);
        if (isUpdatePlanTool(functionName)) {
          upsertAgentPlanUpdate({
            id: event.call.id,
            functionName,
            params
          });
          return;
        }
        if (isAskTool(functionName)) {
          upsertAgentAsk({
            id: event.call.id,
            functionName,
            params
          });
          return;
        }
        if (isInternalTool(functionName, internalToolNames)) return;

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
      case 'tool_response': {
        applyToolResponse({
          callId: event.call.id,
          response: event.response
        });
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
