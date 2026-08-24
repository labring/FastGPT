import { getErrText } from '@fastgpt/global/common/error/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { sandboxToolMap } from '@fastgpt/global/core/ai/sandbox/tools';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import type { AgentLoopEvent, AgentLoopUsage } from '../../llm/agentLoop/interface';
import {
  askUserToolName,
  READ_FILES_TOOL_NAME,
  setPlanToolName,
  updatePlanToolName
} from '../../llm/agentLoop/interface';
import { parseJsonArgs } from '../../utils';
import { getSandboxToolInfo } from '../../sandbox/interface/toolCall';
import type { AuxiliaryGenerationStreamWriter } from '../../auxiliaryGeneration';
import type { localeType } from '@fastgpt/global/common/i18n/type';

const SKILL_DEBUG_AGENT_NODE_ID = 'skill-debug-agent';

const nodeResponseDisplay = {
  master: {
    name: i18nT('chat:master_agent_call'),
    avatar: 'core/app/type/agentFill'
  },
  plan: {
    name: i18nT('chat:plan_update'),
    avatar: 'core/app/agent/child/plan'
  },
  ask: {
    name: i18nT('chat:collect_questions'),
    avatar: 'core/app/agent/child/plan'
  },
  contextCompress: {
    name: i18nT('chat:compress_llm_messages'),
    avatar: 'core/app/agent/child/contextCompress'
  },
  toolResponseCompress: {
    name: i18nT('chat:tool_response_compress'),
    avatar: 'core/app/agent/child/contextCompress'
  },
  readFile: {
    name: i18nT('chat:read_file'),
    avatar: 'core/workflow/template/readFiles'
  }
} as const;

const getUsagePoints = (usages?: AgentLoopUsage[]) =>
  usages?.reduce((sum, usage) => sum + usage.totalPoints, 0) ?? 0;

const createCompressNodeResponse = ({
  name,
  avatar,
  usage,
  requestIds,
  seconds,
  textOutput
}: {
  name: string;
  avatar: string;
  usage?: AgentLoopUsage;
  requestIds: string[];
  seconds: number;
  textOutput?: string;
}): ChatHistoryItemResType => {
  const validRequestIds = requestIds.filter(Boolean);
  const id = validRequestIds[0] || getNanoid();

  return {
    id,
    nodeId: id,
    moduleName: name,
    moduleType: FlowNodeTypeEnum.agent,
    moduleLogo: avatar,
    runningTime: seconds,
    model: usage?.model,
    llmRequestIds: validRequestIds.length > 0 ? validRequestIds : undefined,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalPoints: usage?.totalPoints,
    textOutput
  };
};

/**
 * 将 Skill Debug 的标准 Agent Loop 事件适配成 ChatBox SSE、可持久化 meta response 和
 * node response。该适配器只服务 Skill 域，不依赖 Workflow Dispatcher 或 agentLoopCore。
 */
export const createSkillDebugEventAdapter = ({
  streamWriter,
  lang
}: {
  streamWriter?: AuxiliaryGenerationStreamWriter;
  lang: localeType;
}) => {
  const metaResponses: AIChatItemValueItemType[] = [];
  const nodeResponses: ChatHistoryItemResType[] = [];
  const callNameById = new Map<string, string>();
  const completedCallIds = new Set<string>();
  const completedRequestIds = new Set<string>();
  const completedCompressKeys = new Set<string>();
  const visibleToolNames = new Set([READ_FILES_TOOL_NAME, ...Object.keys(sandboxToolMap)]);

  const getToolInfo = (name: string) => {
    if (name === READ_FILES_TOOL_NAME) {
      return {
        name: nodeResponseDisplay.readFile.name,
        avatar: nodeResponseDisplay.readFile.avatar
      };
    }

    const sandboxTool = getSandboxToolInfo(name, lang);
    return {
      name: sandboxTool?.name ?? name,
      avatar: sandboxTool?.avatar ?? ''
    };
  };

  const appendPlanMetaResponse = (event: Extract<AgentLoopEvent, { type: 'plan_operation' }>) => {
    if (event.success) metaResponses.push({ plan: event.plan });
    if (!event.id) return;

    metaResponses.push({
      id: event.id,
      agentPlanUpdate: {
        id: event.id,
        functionName: event.operation === 'set_plan' ? setPlanToolName : updatePlanToolName,
        params: event.params ?? '',
        response: event.message
      }
    });
  };

  const appendPlanNodeResponse = (event: Extract<AgentLoopEvent, { type: 'plan_operation' }>) => {
    if (!event.id || completedCallIds.has(event.id)) return;
    completedCallIds.add(event.id);

    nodeResponses.push({
      id: `${SKILL_DEBUG_AGENT_NODE_ID}-plan-${event.id}`,
      nodeId: `${SKILL_DEBUG_AGENT_NODE_ID}-plan-${event.id}`,
      moduleName: nodeResponseDisplay.plan.name,
      moduleType: FlowNodeTypeEnum.agent,
      moduleLogo: nodeResponseDisplay.plan.avatar,
      runningTime: event.seconds,
      agentPlanResult: event.message,
      agentPlanStatus: event.operation === 'set_plan' ? 'set_plan' : 'update_plan'
    });
  };

  const appendAskResponse = (event: Extract<AgentLoopEvent, { type: 'ask_start' }>) => {
    if (!event.id) return;
    metaResponses.push({
      id: event.id,
      agentAsk: {
        id: event.id,
        askId: event.id,
        functionName: askUserToolName,
        params: event.params ?? ''
      }
    });
    if (completedCallIds.has(event.id)) return;
    completedCallIds.add(event.id);
    nodeResponses.push({
      id: `${SKILL_DEBUG_AGENT_NODE_ID}-ask-${event.id}`,
      nodeId: `${SKILL_DEBUG_AGENT_NODE_ID}-ask-${event.id}`,
      moduleName: nodeResponseDisplay.ask.name,
      moduleType: FlowNodeTypeEnum.agent,
      moduleLogo: nodeResponseDisplay.ask.avatar,
      runningTime: event.seconds,
      textOutput: event.ask.questions.map((question) => question.question).join('\n')
    });
  };

  const appendLlmNodeResponse = (event: Extract<AgentLoopEvent, { type: 'llm_request_end' }>) => {
    if (completedRequestIds.has(event.requestId)) return;
    completedRequestIds.add(event.requestId);
    const usage = event.usages?.[0];

    nodeResponses.push({
      id: `${SKILL_DEBUG_AGENT_NODE_ID}-${event.requestIndex}-${event.requestId}`,
      nodeId: `${SKILL_DEBUG_AGENT_NODE_ID}-main_agent-${event.requestIndex}`,
      moduleName: nodeResponseDisplay.master.name,
      moduleType: FlowNodeTypeEnum.agent,
      moduleLogo: nodeResponseDisplay.master.avatar,
      runningTime: event.seconds,
      model: event.modelName,
      llmRequestIds: [event.requestId],
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      totalPoints: usage?.totalPoints,
      finishReason: event.finishReason,
      textOutput: event.answerText,
      reasoningText: event.reasoningText,
      ...(event.error ? { errorText: getErrText(event.error) } : {})
    });
  };

  const appendMessageCompressResponse = (
    event: Extract<AgentLoopEvent, { type: 'after_message_compress' }>
  ) => {
    const key = event.requestIds.join(',') || event.contextCheckpoint;
    if (key && completedCompressKeys.has(key)) return;
    if (key) completedCompressKeys.add(key);

    if (event.contextCheckpoint) {
      metaResponses.push({
        contextCheckpoint: event.contextCheckpoint,
        hideInUI: true
      });
    }
    nodeResponses.push(
      createCompressNodeResponse({
        name: nodeResponseDisplay.contextCompress.name,
        avatar: nodeResponseDisplay.contextCompress.avatar,
        usage: event.usages?.[0],
        requestIds: event.requestIds,
        seconds: event.seconds
      })
    );
  };

  const appendToolNodeResponse = (event: Extract<AgentLoopEvent, { type: 'tool_run_end' }>) => {
    if (!visibleToolNames.has(event.call.function.name)) return;
    if (completedCallIds.has(event.call.id)) return;
    completedCallIds.add(event.call.id);
    const toolInfo = getToolInfo(event.call.function.name);
    const compressResponse = event.toolResponseCompress
      ? createCompressNodeResponse({
          name: nodeResponseDisplay.toolResponseCompress.name,
          avatar: nodeResponseDisplay.toolResponseCompress.avatar,
          usage: event.toolResponseCompress.usage,
          requestIds: event.toolResponseCompress.requestIds,
          seconds: event.toolResponseCompress.seconds,
          textOutput: event.toolResponseCompress.response
        })
      : undefined;
    const childTotalPoints = compressResponse?.totalPoints ?? 0;

    nodeResponses.push({
      id: event.call.id,
      nodeId: event.call.id,
      moduleName: toolInfo.name,
      moduleType: FlowNodeTypeEnum.tool,
      moduleLogo: toolInfo.avatar,
      runningTime: event.seconds,
      toolId: event.call.function.name,
      toolInput: parseJsonArgs(event.call.function.arguments) || undefined,
      toolRes: event.response,
      totalPoints: getUsagePoints(event.usages),
      ...(event.errorMessage ? { errorText: event.errorMessage } : {}),
      ...(compressResponse
        ? {
            childrenResponses: [compressResponse],
            ...(childTotalPoints > 0 ? { childTotalPoints } : {})
          }
        : {})
    });
  };

  const emitEvent = (event: AgentLoopEvent) => {
    switch (event.type) {
      case 'llm_request_start':
        streamWriter?.(workflowSseEvent.flowNodeStatus(event.modelName));
        return;
      case 'llm_request_end':
        appendLlmNodeResponse(event);
        return;
      case 'answer_delta':
        streamWriter?.(workflowSseEvent.answerDelta(event.text));
        return;
      case 'reasoning_delta':
        streamWriter?.(workflowSseEvent.reasoningDelta(event.text));
        return;
      case 'tool_call': {
        callNameById.set(event.call.id, event.call.function.name);
        if (!visibleToolNames.has(event.call.function.name)) return;
        const toolInfo = getToolInfo(event.call.function.name);
        streamWriter?.(
          workflowSseEvent.toolCall({
            id: event.call.id,
            toolName: toolInfo.name,
            toolAvatar: toolInfo.avatar,
            functionName: event.call.function.name,
            params: event.call.function.arguments ?? ''
          })
        );
        return;
      }
      case 'tool_params':
        if (!visibleToolNames.has(callNameById.get(event.callId) ?? '')) return;
        streamWriter?.(workflowSseEvent.toolParams({ id: event.callId, params: event.argsDelta }));
        return;
      case 'tool_run_end':
        appendToolNodeResponse(event);
        if (visibleToolNames.has(event.call.function.name)) {
          streamWriter?.(
            workflowSseEvent.toolResponse({ id: event.call.id, response: event.response })
          );
        }
        return;
      case 'plan_status':
        streamWriter?.(workflowSseEvent.planStatus({ status: event.status }));
        return;
      case 'plan_operation':
        appendPlanMetaResponse(event);
        appendPlanNodeResponse(event);
        if (event.success) streamWriter?.(workflowSseEvent.plan(event.plan));
        return;
      case 'ask_start':
        appendAskResponse(event);
        return;
      case 'after_message_compress':
        appendMessageCompressResponse(event);
        return;
      default:
        return;
    }
  };

  const buildAssistantResponses = (
    assistantMessages: ChatCompletionMessageParam[]
  ): AIChatItemValueItemType[] => {
    const visibleCallIds = new Set(
      assistantMessages.flatMap((message) =>
        message.role === 'assistant'
          ? (message.tool_calls ?? [])
              .filter((call) => visibleToolNames.has(call.function.name))
              .map((call) => call.id)
          : []
      )
    );
    const visibleMessages = assistantMessages.flatMap<ChatCompletionMessageParam>((message) => {
      if (message.role === 'tool') {
        return visibleCallIds.has(message.tool_call_id) ? [message] : [];
      }
      if (message.role !== 'assistant') return [];

      const toolCalls = message.tool_calls?.filter((call) => visibleCallIds.has(call.id));
      const hasContent =
        (typeof message.content === 'string' && !!message.content) ||
        (Array.isArray(message.content) && message.content.length > 0) ||
        !!message.reasoning_content;
      if (!hasContent && !toolCalls?.length) return [];

      return [
        {
          ...message,
          tool_calls: toolCalls?.length ? toolCalls : undefined
        }
      ];
    });
    const transcriptResponses = GPTMessages2Chats({
      messages: visibleMessages,
      reserveTool: true,
      reserveReason: true,
      getToolInfo
    }).flatMap((item) => (item.obj === ChatRoleEnum.AI ? item.value : []));

    return [...transcriptResponses, ...metaResponses];
  };

  return {
    nodeResponses,
    emitEvent,
    buildAssistantResponses
  };
};
