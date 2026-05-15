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
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '../../../../../../../web/i18n/utils';
import { parseJsonArgs } from '../../../../../ai/utils';

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
  toolResponseCompress: {
    moduleName: i18nT('chat:tool_response_compress'),
    moduleLogo: 'core/app/agent/child/contextCompress'
  },
  fileCompress: {
    moduleName: i18nT('chat:file_compress_text'),
    moduleLogo: 'core/app/agent/child/contextCompress'
  }
} as const;

type AgentUsageDisplay = Pick<ChatHistoryItemResType, 'moduleName' | 'moduleLogo'>;

const AGENT_CALL_USAGE_NAMES: ReadonlySet<string> = new Set([i18nT('account_usage:agent_call')]);
const CHILD_LLM_USAGE_DISPLAY_MAP = new Map<string, AgentUsageDisplay>([
  [i18nT('account_usage:compress_llm_messages'), AGENT_DISPLAY.contextCompress],
  [i18nT('chat:compress_llm_messages'), AGENT_DISPLAY.contextCompress],
  [i18nT('account_usage:llm_compress_text'), AGENT_DISPLAY.fileCompress],
  [i18nT('account_usage:tool_response_compress'), AGENT_DISPLAY.toolResponseCompress]
]);

type WorkflowAgentLoopRuntimeArtifacts = {
  assistantResponses: AIChatItemValueItemType[];
  nodeResponses: ChatHistoryItemResType[];
  capabilityAssistantResponses: AIChatItemValueItemType[];
};

type LLMRequestEndEvent = Extract<AgentLoopEvent, { type: 'llm_request_end' }>;
type ChildLLMRequestEndEvent = Extract<AgentLoopEvent, { type: 'child_llm_request_end' }>;

/**
 * 将 workflow dispatch 上下文适配成通用 AgentLoopRuntime。
 * 这里集中处理工具目录、事件映射、usage 收集和运行详情收集，让 agentLoop 不依赖 workflow 结构。
 *
 * agentLoop 只认识模型、工具和事件；workflow 还需要额外维护：
 * 1. 前端流式事件：由 eventMapper 把 agentLoop 事件转成 workflowStreamResponse。
 * 2. 聊天内容：assistantResponses 记录可展示/可持久化的交互内容。
 * 3. 运行详情：nodeResponses 平铺记录主模型、工具、plan、压缩模型调用的消耗和 requestId。
 * 4. 能力产物：capabilityAssistantResponses 收集工具额外生成的 AI 消息。
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
  // 工具目录只在 workflow adapter 层生成，agentLoop 后续只依赖通用 toolCatalog。
  const toolCatalog = createWorkflowAgentLoopToolCatalog({
    completionTools: context.completionTools
  });
  // 内置工具需要在事件映射时特殊处理，例如 update_plan / ask_agent 不应按普通业务工具展示。
  const internalToolNames = getWorkflowAgentLoopInternalToolNames(toolCatalog);

  // artifacts 是本次 Agent 节点运行结束后要回写给 workflow/chat 层的结果容器。
  // assistantResponses 和 nodeResponses 允许外部传入，是为了继续复用已有数组并保持引用稳定。
  const artifacts: WorkflowAgentLoopRuntimeArtifacts = {
    assistantResponses,
    nodeResponses,
    capabilityAssistantResponses: []
  };

  // 同一个 requestId 可能同时出现在主模型事件、profile 汇总事件或子调用 usage 中。
  // 这里用 Set 避免运行详情中重复追加同一次 LLM 请求。
  const nodeResponseRequestIds = new Set<string>();

  // agent loop 内部所有可展示步骤都直接写入 nodeResponses 顶层。
  // 不再使用 childrenResponses，避免前端需要理解 workflow/agent 内部层级。
  const planNodeCallIds = new Set<string>();

  // eventMapper 只负责把 agentLoop 事件翻译成前端可消费的 workflow stream 事件；
  // 本文件在 emitEvent 中先收集持久化数据，再把原始事件交给 mapper。
  const eventMapper = createWorkflowAgentLoopEventMapper({
    workflowStreamResponse,
    getSubAppInfo: context.getSubAppInfo,
    internalToolNames,
    updatePlanToolName: toolCatalog.updatePlanTool?.function.name,
    askToolName: toolCatalog.askTool?.function.name,
    showReasoning: context.params.aiChatReasoning !== false,
    assistantResponses
  });

  // executeToolFactory 默认来自 workflow 工具调度器，测试可注入 mock。
  const executeTool = executeToolFactory(context);

  type AgentPlanStatus = NonNullable<ChatHistoryItemResType['agentPlanStatus']>;

  // 压缩类 usage 不是业务工具，但也会产生独立 LLM requestId 和计费信息。
  // 这里把它们映射成稳定的运行详情展示项。
  const getUsageDisplay = (usage: ChatNodeUsageType) => {
    const display = CHILD_LLM_USAGE_DISPLAY_MAP.get(usage.moduleName);
    if (display) return display;

    return {
      moduleName: usage.moduleName,
      moduleLogo: AGENT_DISPLAY.master.moduleLogo
    };
  };

  const getUsageTotalPoints = (usages: ChatNodeUsageType[] = []) =>
    usages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

  const getUpdatePlanStatus = (
    call: NonNullable<LLMRequestEndEvent['toolCalls']>[number]
  ): AgentPlanStatus => {
    const args = parseJsonArgs<{ updates?: Array<{ action?: string }> }>(call.function.arguments);
    const updates = Array.isArray(args?.updates) ? args.updates : [];

    if (updates.some((item) => item?.action === 'set_plan' || item?.action === 'replace_plan')) {
      return 'set_plan';
    }

    return 'update_plan';
  };

  const getPlanToolStatus = (
    call: NonNullable<LLMRequestEndEvent['toolCalls']>[number]
  ): AgentPlanStatus | undefined => {
    const askToolName = toolCatalog.askTool?.function.name;
    const updatePlanToolName = toolCatalog.updatePlanTool?.function.name;

    if (askToolName && call.function.name === askToolName) {
      return 'ask_question';
    }

    if (updatePlanToolName && call.function.name === updatePlanToolName) {
      return getUpdatePlanStatus(call);
    }
  };

  const appendPlanToolNodeResponse = ({
    call,
    runningTime
  }: {
    call: NonNullable<LLMRequestEndEvent['toolCalls']>[number];
    runningTime?: number;
  }) => {
    if (planNodeCallIds.has(call.id)) return;

    const agentPlanStatus = getPlanToolStatus(call);
    if (!agentPlanStatus) return;

    planNodeCallIds.add(call.id);
    artifacts.nodeResponses.push({
      id: `${context.node.nodeId}-plan-${call.id}`,
      nodeId: `${context.node.nodeId}-plan-${call.id}`,
      moduleName: AGENT_DISPLAY.plan.moduleName,
      moduleType: context.node.flowNodeType,
      moduleLogo: AGENT_DISPLAY.plan.moduleLogo,
      runningTime,
      agentPlanStatus
    });
  };

  const appendPlanToolNodeResponses = (event: LLMRequestEndEvent) => {
    event.toolCalls?.forEach((call) =>
      appendPlanToolNodeResponse({
        call,
        runningTime: event.seconds
      })
    );
  };

  // 主模型每轮结束后都记录一条运行详情。
  // 即使本轮没有文本、reasoning 或工具调用，也保留 requestId 和 usage，方便排查空响应与计费。
  // 被 stop gate 打回的 assistant message 会在 agentLoop 内从最终 assistantMessages 移除，
  // 但这里仍保留它对应的 nodeResponse，方便前端完整展示模型中间过程。
  const appendAgentCallNodeResponse = (event: LLMRequestEndEvent) => {
    nodeResponseRequestIds.add(event.requestId);

    const agentResponse: ChatHistoryItemResType = {
      id: `${context.node.nodeId}-${event.requestIndex}-${event.requestId}`,
      nodeId: `${context.node.nodeId}-main_agent-${event.requestIndex}`,
      moduleName: AGENT_DISPLAY.master.moduleName,
      moduleType: context.node.flowNodeType,
      moduleLogo: AGENT_DISPLAY.master.moduleLogo,
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
    artifacts.nodeResponses.push(agentResponse);
    appendPlanToolNodeResponses(event);
  };

  const createFallbackToolNodeResponse = ({
    call,
    response,
    usages
  }: {
    call: Parameters<AgentLoopRuntime['executeTool']>[0]['call'];
    response: string;
    usages?: ChatNodeUsageType[];
  }): ChatHistoryItemResType => {
    const subInfo = context.getSubAppInfo(call.function.name);
    const parsedInput = parseJsonArgs(call.function.arguments);

    return {
      id: call.id,
      nodeId: call.id,
      moduleType: FlowNodeTypeEnum.tool,
      moduleName: subInfo.name || call.function.name,
      moduleLogo: subInfo.avatar,
      toolInput: parsedInput || undefined,
      toolRes: response,
      totalPoints: getUsageTotalPoints(usages)
    };
  };

  // 子 LLM 事件来自上下文压缩、工具响应压缩等内部调用。
  // 普通 Agent 调用已经由 llm_request_end 记录，这里跳过 account_usage:agent_call 避免重复展示。
  const appendChildLLMNodeResponse = (event: ChildLLMRequestEndEvent) => {
    if (event.usage && AGENT_CALL_USAGE_NAMES.has(event.usage.moduleName)) return;

    const requestIds = event.requestIds.filter(
      (requestId) => !!requestId && !nodeResponseRequestIds.has(requestId)
    );
    if (requestIds.length === 0) return;

    requestIds.forEach((requestId) => {
      nodeResponseRequestIds.add(requestId);
    });
    const display = event.usage ? getUsageDisplay(event.usage) : AGENT_DISPLAY.contextCompress;
    const responseId = requestIds[0];
    artifacts.nodeResponses.push({
      id: `${context.node.nodeId}-usage-${responseId}`,
      nodeId: `${context.node.nodeId}-usage-${responseId}`,
      moduleName: display.moduleName,
      moduleType: context.node.flowNodeType,
      moduleLogo: display.moduleLogo,
      runningTime: event.seconds,
      model: event.usage?.model,
      llmRequestIds: requestIds,
      inputTokens: event.usage?.inputTokens,
      outputTokens: event.usage?.outputTokens,
      totalPoints: event.usage?.totalPoints
    });
  };

  return {
    artifacts,
    runtime: {
      model: context.params.model,
      reasoningEffort: context.params.aiChatReasoningEffort,
      userKey: context.externalProvider.openaiAccount,
      stream: context.stream,
      useVision: context.params.aiChatVision,
      checkIsStopping: context.checkIsStopping,
      toolCatalog,
      executeTool: async ({ call }) => {
        // agentLoop 传入标准 tool call；workflow 工具调度器需要 callId/toolId/args。
        // 这里同时把工具返回的 nodeResponse、能力消息和 usages 收集回 artifacts。
        const result = await executeTool({
          callId: call.id,
          toolId: call.function.name,
          args: call.function.arguments
        });

        const toolNodeResponse =
          result.nodeResponse ||
          createFallbackToolNodeResponse({
            call,
            response: result.response,
            usages: result.usages
          });
        artifacts.nodeResponses.push(toolNodeResponse);
        const responseRequestIds = toolNodeResponse.llmRequestIds ?? [];
        responseRequestIds.forEach((requestId) => nodeResponseRequestIds.add(requestId));

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
        // 事件处理顺序有意保持为：先收集后端持久化需要的运行详情，再推给前端。
        // 这样即使前端事件映射逻辑变化，也不影响 chat record 的运行数据完整性。
        if (event.type === 'llm_request_end') {
          appendAgentCallNodeResponse(event);
        }
        if (event.type === 'child_llm_request_end') {
          appendChildLLMNodeResponse(event);
        }
        eventMapper.emitEvent(event);
      },
      usageSink: (usages) => {
        // usage 的实时计费/累计仍由 workflow 外层统一处理，runtime 只负责把 agentLoop 的 usage 透传出去。
        usagePush(usages);
      }
    }
  };
};
