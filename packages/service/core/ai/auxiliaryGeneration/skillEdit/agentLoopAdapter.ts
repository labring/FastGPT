import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ToolModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { streamSseEvent } from '@fastgpt/global/core/chat/stream/sse';
import {
  createAgentLoopControlToolResponseStore,
  createAgentLoopCallNodeResponse,
  createAgentLoopMessageCompressNodeResponse,
  createAgentLoopPlanToolNodeResponse,
  createAgentLoopToolNodeResponse,
  createAgentLoopToolResponseCompressNodeResponse,
  updateAgentLoopToolResponse,
  upsertAgentLoopToolResponse,
  type AgentLoopEvent,
  type AgentLoopToolCatalog
} from '../../llm/agentLoop';
import type { AuxiliaryGenerationStreamWriter } from '../stream';
import { getSandboxToolInfo } from '../../sandbox/interface/toolCall';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { SKILL_EDIT_AGENT_NODE_ID } from './utils';

type LLMRequestEndEvent = Extract<AgentLoopEvent, { type: 'llm_request_end' }>;
type AfterMessageCompressEvent = Extract<AgentLoopEvent, { type: 'after_message_compress' }>;

const getToolName = (tool?: AgentLoopToolCatalog['runtimeTools'][number]) => tool?.function.name;

/**
 * 将 skill edit agent loop 事件适配成 ChatBox 可消费的流式事件和可持久化 artifacts。
 *
 * 这里包含状态聚合：tool_call/tool_params/tool_response 会共同维护同一个工具卡片，
 * LLM/tool 压缩事件会写入运行详情。因此它不是纯 event mapper，而是 skill edit
 * 辅助生成入口的 agent-loop adapter。
 */
export const createSkillEditAgentLoopAdapter = ({
  streamWriter,
  toolCatalog,
  lang
}: {
  streamWriter?: AuxiliaryGenerationStreamWriter;
  toolCatalog: AgentLoopToolCatalog;
  lang: localeType;
}) => {
  const assistantResponses: AIChatItemValueItemType[] = [];
  const nodeResponses: ChatHistoryItemResType[] = [];
  const toolNameByCallId = new Map<string, string>();
  const runtimeToolNames = new Set(
    toolCatalog.runtimeTools.map(getToolName).filter((name): name is string => !!name)
  );
  const updatePlanToolName = toolCatalog.updatePlanTool?.function.name;
  const askToolName = toolCatalog.askTool?.function.name;
  const isUpdatePlanTool = (name?: string) => !!name && name === updatePlanToolName;
  const isAskTool = (name?: string) => !!name && name === askToolName;
  const { upsertPlanUpdate, updatePlanUpdate, upsertAsk, updateAsk } =
    createAgentLoopControlToolResponseStore(assistantResponses);
  const appendedToolCallIds = new Set<string>();

  const write = streamWriter;
  const getToolInfo = (functionName: string) => {
    if (functionName === SubAppIds.readFiles) {
      return {
        name: i18nT('chat:read_file'),
        avatar: '',
        moduleType: FlowNodeTypeEnum.readFiles
      };
    }
    const sandboxToolInfo = getSandboxToolInfo(functionName, lang);
    return {
      name: sandboxToolInfo?.name || functionName,
      avatar: sandboxToolInfo?.avatar || '',
      moduleType: FlowNodeTypeEnum.tool
    };
  };

  const insertAssistantTextBeforeRuntimeTools = ({
    toolCalls,
    assistantText,
    reasoningText
  }: {
    toolCalls: LLMRequestEndEvent['toolCalls'];
    assistantText?: string;
    reasoningText?: string;
  }) => {
    const runtimeToolCalls = (toolCalls || []).filter((call) => {
      const functionName = call.function.name;
      return functionName && runtimeToolNames.has(functionName);
    });
    if (!runtimeToolCalls.length) return;

    const runtimeToolCallIds = new Set(runtimeToolCalls.map((call) => call.id));
    const existingIndex = assistantResponses.findIndex((item) =>
      item.tools?.some((tool) => runtimeToolCallIds.has(tool.id))
    );

    if (!assistantText) {
      // 工具调用前只有 reasoning 时，将其挂到对应工具卡，避免刷新后丢失这段上下文。
      if (!reasoningText || existingIndex < 0) return;

      const currentValue = assistantResponses[existingIndex];
      assistantResponses[existingIndex] = {
        ...currentValue,
        reasoning: {
          content: [currentValue.reasoning?.content, reasoningText].filter(Boolean).join('\n\n')
        }
      };
      return;
    }

    const insertIndex = existingIndex >= 0 ? existingIndex : assistantResponses.length;
    assistantResponses.splice(insertIndex, 0, {
      text: { content: assistantText },
      ...(reasoningText ? { reasoning: { content: reasoningText } } : {})
    });
  };

  const appendAgentCallNodeResponse = (event: LLMRequestEndEvent) =>
    nodeResponses.push(
      createAgentLoopCallNodeResponse({
        event,
        node: {
          nodeId: SKILL_EDIT_AGENT_NODE_ID,
          moduleType: FlowNodeTypeEnum.agent
        }
      })
    );

  const appendMessageCompressNodeResponse = (event: AfterMessageCompressEvent) =>
    nodeResponses.push(
      createAgentLoopMessageCompressNodeResponse({
        event,
        moduleType: FlowNodeTypeEnum.agent
      })
    );

  const emitEvent = (event: AgentLoopEvent) => {
    switch (event.type) {
      case 'answer_delta': {
        write?.(streamSseEvent.answerDelta(event.text));
        return;
      }
      case 'reasoning_delta': {
        write?.(streamSseEvent.reasoningDelta(event.text));
        return;
      }
      case 'llm_request_start': {
        write?.(streamSseEvent.flowNodeStatus(event.modelName));
        return;
      }
      case 'llm_request_end': {
        appendAgentCallNodeResponse(event);
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
        appendMessageCompressNodeResponse(event);
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
          upsertPlanUpdate({
            id: event.call.id,
            functionName,
            params
          });
          return;
        }
        if (isAskTool(functionName)) {
          upsertAsk({
            id: event.call.id,
            functionName,
            params
          });
          return;
        }
        if (!runtimeToolNames.has(functionName)) return;

        const toolInfo = getToolInfo(functionName);
        const tool: ToolModuleResponseItemType = {
          id: event.call.id,
          toolName: toolInfo.name,
          toolAvatar: toolInfo.avatar,
          functionName,
          params
        };
        upsertAgentLoopToolResponse({
          assistantResponses,
          tool
        });
        write?.(streamSseEvent.toolCall(tool));
        return;
      }
      case 'tool_params': {
        const functionName = toolNameByCallId.get(event.callId);
        if (isUpdatePlanTool(functionName)) {
          updatePlanUpdate(event.callId, (update) => ({
            ...update,
            params: `${update.params || ''}${event.argsDelta}`
          }));
          return;
        }
        if (isAskTool(functionName)) {
          updateAsk(event.callId, (ask) => ({
            ...ask,
            params: `${ask.params || ''}${event.argsDelta}`
          }));
          return;
        }
        if (!functionName || !runtimeToolNames.has(functionName)) return;

        updateAgentLoopToolResponse({
          assistantResponses,
          callId: event.callId,
          updater: (tool) => ({
            ...tool,
            params: `${tool.params || ''}${event.argsDelta}`
          })
        });
        write?.(streamSseEvent.toolParams({ id: event.callId, params: event.argsDelta }));
        return;
      }
      case 'tool_response': {
        if (appendedToolCallIds.has(event.call.id)) return;
        appendedToolCallIds.add(event.call.id);
        const functionName = event.call.function.name;
        if (isUpdatePlanTool(functionName)) {
          updatePlanUpdate(event.call.id, (update) => ({
            ...update,
            response: `${update.response || ''}${event.response}`
          }));
        }
        const planNodeResponse = createAgentLoopPlanToolNodeResponse({
          event,
          node: {
            nodeId: SKILL_EDIT_AGENT_NODE_ID,
            moduleType: FlowNodeTypeEnum.agent
          },
          toolCatalog
        });
        if (planNodeResponse) {
          nodeResponses.push(planNodeResponse);
          return;
        }
        if (!runtimeToolNames.has(functionName)) return;

        updateAgentLoopToolResponse({
          assistantResponses,
          callId: event.call.id,
          updater: (tool) => ({
            ...tool,
            response: event.response
          })
        });
        const toolInfo = getToolInfo(functionName);
        const toolNodeResponse = createAgentLoopToolNodeResponse({
          event,
          toolInfo
        });
        const compressNodeResponse = event.toolResponseCompress
          ? createAgentLoopToolResponseCompressNodeResponse({
              compress: event.toolResponseCompress,
              moduleType: FlowNodeTypeEnum.agent
            })
          : undefined;
        nodeResponses.push({
          ...toolNodeResponse,
          ...(compressNodeResponse ? { childrenResponses: [compressNodeResponse] } : {})
        });
        write?.(streamSseEvent.toolResponse({ id: event.call.id, response: event.response }));
        return;
      }
      case 'plan_status': {
        write?.(streamSseEvent.planStatus({ status: event.status }));
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
          assistantResponses.push({
            plan: event.plan
          });
        }

        write?.(streamSseEvent.plan(event.plan));
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
    artifacts: {
      assistantResponses,
      nodeResponses
    },
    emitEvent
  };
};
