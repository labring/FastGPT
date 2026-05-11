import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { AgentLoopEvent, AgentLoopRuntime } from '../../../../../ai/llm/agentLoop';
import { getExecuteTool, type ToolDispatchContext } from '../utils';
import type { WorkflowResponseType } from '../../../type';
import { createWorkflowAgentLoopEventMapper } from './eventMapper';
import {
  createWorkflowAgentLoopToolCatalog,
  getWorkflowAgentLoopInternalToolNames
} from './toolCatalog';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '../../../../../../../web/i18n/utils';

type WorkflowAgentLoopRuntimeContext = ToolDispatchContext & {
  node: {
    nodeId: string;
    flowNodeType: FlowNodeTypeEnum;
  };
};

const AGENT_DISPLAY = {
  master: {
    moduleName: i18nT('chat:master_agent_call'),
    moduleLogo: 'core/workflow/template/agent'
  },
  plan: {
    moduleName: i18nT('chat:plan_agent'),
    moduleLogo: 'core/app/agent/child/plan'
  },
  contextCompress: {
    moduleName: i18nT('chat:compress_llm_messages'),
    moduleLogo: 'core/app/agent/child/contextCompress'
  },
  fileCompress: {
    moduleLogo: 'core/app/agent/child/contextCompress'
  }
} as const;

const CONTEXT_COMPRESS_USAGE_NAMES = new Set([
  'account_usage:compress_llm_messages',
  'chat:compress_llm_messages'
]);
const AGENT_CALL_USAGE_NAMES = new Set(['account_usage:agent_call']);
const FILE_COMPRESS_USAGE_NAMES = new Set(['account_usage:llm_compress_text']);

export type WorkflowAgentLoopRuntimeArtifacts = {
  assistantResponses: AIChatItemValueItemType[];
  nodeResponses: ChatHistoryItemResType[];
  capabilityAssistantResponses: AIChatItemValueItemType[];
  llmRequestIds: string[];
};

type LLMRequestEndEvent = Extract<AgentLoopEvent, { type: 'llm_request_end' }>;
type ChildLLMRequestEndEvent = Extract<AgentLoopEvent, { type: 'child_llm_request_end' }>;

const shouldAppendAgentCallNodeResponse = (event: LLMRequestEndEvent) => {
  if (event.error) return true;
  if (event.toolCalls?.length) return true;
  if (event.finishReason === 'tool_calls') return true;
  if (event.answerText?.trim()) return true;
  if (event.reasoningText?.trim()) return true;

  return false;
};

/**
 * 将 workflow dispatch 上下文适配成通用 AgentLoopRuntime。
 * 这里集中处理工具目录、事件映射、usage 收集和子节点响应收集，让 agentLoop 不依赖 workflow 结构。
 */
export const createWorkflowAgentLoopRuntime = ({
  context,
  usagePush,
  workflowStreamResponse,
  assistantResponses = [],
  nodeResponses = [],
  executeToolFactory = getExecuteTool
}: {
  context: WorkflowAgentLoopRuntimeContext;
  usagePush: (usages: ChatNodeUsageType[]) => void;
  workflowStreamResponse?: WorkflowResponseType;
  assistantResponses?: AIChatItemValueItemType[];
  nodeResponses?: ChatHistoryItemResType[];
  executeToolFactory?: typeof getExecuteTool;
}): {
  runtime: AgentLoopRuntime;
  artifacts: WorkflowAgentLoopRuntimeArtifacts;
} => {
  const toolCatalog = createWorkflowAgentLoopToolCatalog({
    completionTools: context.completionTools
  });
  const internalToolNames = getWorkflowAgentLoopInternalToolNames(toolCatalog);
  const artifacts: WorkflowAgentLoopRuntimeArtifacts = {
    assistantResponses,
    nodeResponses,
    capabilityAssistantResponses: [],
    llmRequestIds: []
  };
  const nodeResponseRequestIds = new Set<string>();
  let activeAgentResponse: ChatHistoryItemResType | undefined;
  const eventMapper = createWorkflowAgentLoopEventMapper({
    workflowStreamResponse,
    getSubAppInfo: context.getSubAppInfo,
    internalToolNames,
    updatePlanToolName: toolCatalog.updatePlanTool?.function.name,
    askToolName: toolCatalog.askTool?.function.name,
    assistantResponses
  });
  const executeTool = executeToolFactory(context);
  const getAgentDisplay = (agentName?: string) => {
    if (agentName === 'Plan Agent') {
      return AGENT_DISPLAY.plan;
    }

    return {
      moduleName: AGENT_DISPLAY.master.moduleName,
      moduleLogo: AGENT_DISPLAY.master.moduleLogo
    };
  };
  const getUsageDisplay = (usage: ChatNodeUsageType) => {
    // 历史上下文压缩在运行详情中使用固定名称和图标。
    if (CONTEXT_COMPRESS_USAGE_NAMES.has(usage.moduleName)) {
      return AGENT_DISPLAY.contextCompress;
    }

    // 工具响应压缩过去挂在工具节点的 compressTextAgent 上，这里作为独立 LLM 调用展示时复用压缩图标。
    if (FILE_COMPRESS_USAGE_NAMES.has(usage.moduleName)) {
      return {
        moduleName: usage.moduleName,
        moduleLogo: AGENT_DISPLAY.fileCompress.moduleLogo
      };
    }

    return {
      moduleName: usage.moduleName,
      moduleLogo: AGENT_DISPLAY.master.moduleLogo
    };
  };
  const collectRequestIds = (requestIds: Array<string | undefined>) => {
    requestIds.forEach((requestId) => {
      if (!requestId) return;

      if (!artifacts.llmRequestIds.includes(requestId)) {
        artifacts.llmRequestIds.push(requestId);
      }
    });
  };
  const appendAgentCallNodeResponse = (event: LLMRequestEndEvent) => {
    if (!shouldAppendAgentCallNodeResponse(event)) return;

    nodeResponseRequestIds.add(event.requestId);
    const display = getAgentDisplay(event.agentName);

    const agentResponse: ChatHistoryItemResType = {
      id: `${context.node.nodeId}-${event.requestIndex}-${event.requestId}`,
      nodeId: `${context.node.nodeId}-${event.profile}-${event.requestIndex}`,
      moduleName: display.moduleName,
      moduleType: context.node.flowNodeType,
      moduleLogo: display.moduleLogo,
      runningTime: event.seconds,
      model: event.modelName,
      llmRequestIds: [event.requestId],
      inputTokens: event.usage?.inputTokens,
      outputTokens: event.usage?.outputTokens,
      totalPoints: event.usage?.totalPoints,
      finishReason: event.finishReason,
      textOutput: event.answerText,
      reasoningText: event.reasoningText,
      ...(event.error ? { errorText: getErrText(event.error) } : {})
    };
    activeAgentResponse = agentResponse;
    artifacts.nodeResponses.push(agentResponse);
  };
  const addChildPointsToActiveAgent = (childPoints?: number) => {
    if (!activeAgentResponse || !childPoints) return;

    activeAgentResponse.childTotalPoints = +(
      (activeAgentResponse.childTotalPoints || 0) + childPoints
    ).toFixed(12);
    // 父节点 totalPoints 表示本 Agent 调用及其子调用的总消耗。
    activeAgentResponse.totalPoints = +(
      (activeAgentResponse.totalPoints || 0) + childPoints
    ).toFixed(12);
  };
  const appendChildNodeResponse = (nodeResponse: ChatHistoryItemResType) => {
    if (activeAgentResponse) {
      activeAgentResponse.childrenResponses = [
        ...(activeAgentResponse.childrenResponses || []),
        nodeResponse
      ];
      addChildPointsToActiveAgent(nodeResponse.totalPoints);
      return;
    }

    artifacts.nodeResponses.push(nodeResponse);
  };
  const appendChildLLMNodeResponse = (event: ChildLLMRequestEndEvent) => {
    if (AGENT_CALL_USAGE_NAMES.has(event.usage.moduleName)) return;

    event.requestIds.forEach((requestId) => {
      if (!requestId || nodeResponseRequestIds.has(requestId)) return;

      nodeResponseRequestIds.add(requestId);
      const display = getUsageDisplay(event.usage);
      appendChildNodeResponse({
        id: `${context.node.nodeId}-usage-${requestId}`,
        nodeId: `${context.node.nodeId}-usage-${requestId}`,
        moduleName: display.moduleName,
        moduleType: context.node.flowNodeType,
        moduleLogo: display.moduleLogo,
        runningTime: event.seconds,
        model: event.usage.model,
        llmRequestIds: [requestId],
        inputTokens: event.usage.inputTokens,
        outputTokens: event.usage.outputTokens,
        totalPoints: event.usage.totalPoints
      });
    });
  };

  return {
    artifacts,
    runtime: {
      model: context.params.model,
      userKey: context.externalProvider.openaiAccount,
      stream: context.stream,
      useVision: context.params.aiChatVision,
      checkIsStopping: context.checkIsStopping,
      toolCatalog,
      executeTool: async ({ call }) => {
        const result = await executeTool({
          callId: call.id,
          toolId: call.function.name,
          args: call.function.arguments
        });

        if (result.nodeResponse) {
          appendChildNodeResponse(result.nodeResponse);
          const responseRequestIds = result.nodeResponse.llmRequestIds ?? [];
          collectRequestIds(responseRequestIds);
          responseRequestIds.forEach((requestId) => nodeResponseRequestIds.add(requestId));
        }
        if (result.capabilityAssistantResponses?.length) {
          artifacts.capabilityAssistantResponses.push(...result.capabilityAssistantResponses);
        }

        return {
          response: result.response,
          assistantMessages: [],
          usages: result.usages ?? [],
          stop: result.stop
        };
      },
      emitEvent: (event) => {
        if (event.type === 'llm_request_end') {
          collectRequestIds([event.requestId]);
          appendAgentCallNodeResponse(event);
        }
        if (event.type === 'profile_end') {
          collectRequestIds(event.requestIds);
        }
        if (event.type === 'child_llm_request_end') {
          collectRequestIds(event.requestIds);
          appendChildLLMNodeResponse(event);
        }
        eventMapper.emitEvent(event);
      },
      usageSink: (usages) => {
        usagePush(usages);
      }
    }
  };
};
