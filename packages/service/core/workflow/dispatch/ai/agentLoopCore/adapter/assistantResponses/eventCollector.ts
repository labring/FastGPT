import type {
  AIChatItemValueItemType,
  ToolModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import type { AgentLoopEvent } from '../../../../../../ai/llm/agentLoop/domain/event';
import type { AgentLoopCoreToolDisplayInfo } from '../../domain/toolInfo';
type AgentLoopCoreAssistantMetaEventNames = {
  setPlanToolName?: string;
  updatePlanToolName?: string;
  askToolName?: string;
};
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { WORKFLOW_BUILDER_PREVIEW_TOOL_NAME } from '@fastgpt/global/core/workflow/builder/constants';
import { createAgentLoopCoreAskInteractive } from '../interactive/ask';

export type CreateAgentLoopCoreAssistantEventCollectorParams = {
  assistantResponses?: AIChatItemValueItemType[];
  showReasoning?: boolean;
  getToolInfo?: (name: string) => AgentLoopCoreToolDisplayInfo | undefined;
  metaEventNames?: AgentLoopCoreAssistantMetaEventNames;
};

/**
 * 按模型响应维护唯一 value。调用 ID 显式关联所属响应，执行完成顺序不影响工具顺序。
 * 子工具展示输出不属于父模型 transcript；隐藏工具仍完整保留调用和实际消费的结果。
 */
export const createAgentLoopCoreAssistantEventCollector = ({
  assistantResponses = [],
  showReasoning = true,
  getToolInfo,
  metaEventNames = {}
}: CreateAgentLoopCoreAssistantEventCollectorParams = {}) => {
  let current: AIChatItemValueItemType | undefined;
  const groupsByResponse = new Map<string, AIChatItemValueItemType>();
  const groupsByCall = new Map<string, AIChatItemValueItemType>();
  const completedRequests = new Set<string>();
  const completedCalls = new Set<string>();
  const checkpoints = new Set<string>();
  const childValues = new Map<string, AIChatItemValueItemType[]>();
  const askIds = new Set<string>();

  const createGroup = (responseId = getNanoid()) => {
    const group: AIChatItemValueItemType = { modelResponseId: responseId };
    assistantResponses.push(group);
    groupsByResponse.set(responseId, group);
    return group;
  };
  const ensureCurrent = () => (current ??= createGroup());
  const createTool = (call: {
    id: string;
    function: { name: string; arguments: string };
  }): ToolModuleResponseItemType => {
    const info = getToolInfo?.(call.function.name);
    return {
      id: call.id,
      functionName: call.function.name,
      params: call.function.arguments,
      toolName: info?.name ?? call.function.name,
      toolAvatar: info?.avatar ?? ''
    };
  };
  const ensureTool = (
    call: Parameters<typeof createTool>[0],
    group = groupsByCall.get(call.id) ?? ensureCurrent()
  ) => {
    groupsByCall.set(call.id, group);
    group.tools ??= [];
    let tool = group.tools.find((tool) => tool.id === call.id);
    if (!tool) {
      tool = createTool(call);
      group.tools.push(tool);
    }
    group.toolCallIds ??= [];
    if (!group.toolCallIds.includes(call.id)) group.toolCallIds.push(call.id);
    return { group, tool };
  };
  /** 只有整个 value 都是隐藏工具时隐藏气泡；混合正文或计划仍按原样展示。 */
  const refreshVisibility = (group: AIChatItemValueItemType) => {
    group.hideInUI =
      !group.text?.content &&
      (!group.reasoning?.content || group.hideReason) &&
      !group.plan &&
      !group.interactive &&
      !!group.tools?.length &&
      group.tools.every((tool) => tool.hideInUI);
  };
  const emitEvent = (event: AgentLoopEvent) => {
    switch (event.type) {
      case 'user_message':
        assistantResponses.push({
          userMessage: { content: event.content, source: event.source },
          hideInUI: true
        });
        current = undefined;
        return;
      case 'llm_request_start':
        current = createGroup(event.responseId);
        return;
      case 'answer_delta': {
        const group = ensureCurrent();
        group.text = { content: (group.text?.content ?? '') + event.text };
        refreshVisibility(group);
        return;
      }
      case 'reasoning_delta': {
        const group = ensureCurrent();
        group.reasoning = { content: (group.reasoning?.content ?? '') + event.text };
        if (!showReasoning) group.hideReason = true;
        refreshVisibility(group);
        return;
      }
      case 'llm_request_end': {
        const key = event.responseId ?? event.requestId;
        if (completedRequests.has(key)) return;
        completedRequests.add(key);
        const group = event.responseId
          ? (groupsByResponse.get(event.responseId) ?? createGroup(event.responseId))
          : ensureCurrent();
        const content =
          event.assistantMessage?.role === 'assistant'
            ? event.assistantMessage.content
            : event.answerText;
        if (typeof content === 'string') group.text = { content };
        if (event.reasoningText !== undefined) group.reasoning = { content: event.reasoningText };
        if (!showReasoning && group.reasoning) group.hideReason = true;
        const calls = event.toolCalls ?? [];
        if (calls.length) {
          calls.forEach((call) => {
            const { tool } = ensureTool(call, group);
            Object.assign(tool, createTool(call));
          });
          group.toolCallIds = calls.map((call) => call.id);
          group.tools = group.toolCallIds.flatMap(
            (id) => group.tools?.filter((tool) => tool.id === id) ?? []
          );
        }
        refreshVisibility(group);
        current = undefined;
        return;
      }
      case 'tool_call':
        ensureTool(event.call);
        return;
      case 'tool_params': {
        const tool = groupsByCall
          .get(event.callId)
          ?.tools?.find((tool) => tool.id === event.callId);
        if (tool) tool.params += event.argsDelta;
        return;
      }
      case 'tool_activity': {
        const { tool } = ensureTool({
          id: event.callId,
          function: { name: event.toolName, arguments: '' }
        });
        tool.hideDetails = true;
        if (event.status === 'done') tool.response = '';
        return;
      }
      case 'tool_run_end': {
        if (event.resumed) {
          // Preview 的结果可完全由紧邻 Human 推导，不保存第二份决策。
          if (event.call.function.name === WORKFLOW_BUILDER_PREVIEW_TOOL_NAME) return;
          assistantResponses.push({
            toolResponses: [{ id: event.call.id, response: event.response }],
            hideInUI: true
          });
          assistantResponses.push(
            ...(event.assistantResponses ?? []).map((value) => ({ ...value, displayOnly: true }))
          );
          return;
        }
        // 有效 Ask 由 interactive 唯一保存，等待占位不再写第二份 tool。
        if (askIds.has(event.call.id) || completedCalls.has(event.call.id)) return;
        completedCalls.add(event.call.id);
        const { group, tool } = ensureTool(event.call);
        tool.params = event.call.function.arguments;
        tool.response = event.response;
        if (event.hideInUI) tool.hideInUI = true;
        if (event.internalOnly) tool.internalOnly = true;
        refreshVisibility(group);

        // 展示输出按调用顺序插入，但永远不参与父模型恢复。
        const previousChildren = new Set(
          (group.toolCallIds ?? []).flatMap((id) => childValues.get(id) ?? [])
        );
        if (event.assistantResponses?.length)
          childValues.set(
            event.call.id,
            event.assistantResponses.map((value) => ({ ...value, displayOnly: true }))
          );
        for (let index = assistantResponses.length - 1; index >= 0; index--) {
          if (previousChildren.has(assistantResponses[index])) assistantResponses.splice(index, 1);
        }
        assistantResponses.splice(
          assistantResponses.indexOf(group) + 1,
          0,
          ...(group.toolCallIds ?? []).flatMap((id) => childValues.get(id) ?? [])
        );
        return;
      }
      case 'ask_start': {
        if (!event.id) return;
        const group = groupsByCall.get(event.id) ?? ensureCurrent();
        askIds.add(event.id);
        group.tools = group.tools?.filter((tool) => tool.id !== event.id);
        if (!group.tools?.length) delete group.tools;
        group.interactive = {
          ...createAgentLoopCoreAskInteractive({ askId: event.id, ask: event.ask }),
          entryNodeIds: [],
          memoryEdges: [],
          nodeOutputs: []
        };
        group.toolCallIds ??= [event.id];
        refreshVisibility(group);
        return;
      }
      case 'plan_operation': {
        const group = event.id ? (groupsByCall.get(event.id) ?? ensureCurrent()) : ensureCurrent();
        if (event.success) group.plan = event.plan;
        // Pi 或旧事件未提供 request-end 调用时仍按显式 call ID 补齐，不猜测相邻工具。
        if (event.id) {
          const { tool } = ensureTool(
            {
              id: event.id,
              function: {
                name:
                  event.operation === 'set_plan'
                    ? (metaEventNames.setPlanToolName ?? 'set_plan')
                    : (metaEventNames.updatePlanToolName ?? 'update_plan'),
                arguments: event.params ?? ''
              }
            },
            group
          );
          tool.response = event.message;
          tool.hideInUI = true;
        }
        refreshVisibility(group);
        return;
      }
      case 'after_message_compress': {
        if (!event.contextCheckpoint || checkpoints.has(event.contextCheckpoint)) return;
        checkpoints.add(event.contextCheckpoint);
        assistantResponses.push({ contextCheckpoint: event.contextCheckpoint, hideInUI: true });
        current = undefined;
        return;
      }
    }
  };
  return { assistantResponses, emitEvent };
};
