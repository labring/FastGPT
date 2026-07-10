import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { parseJsonArgs } from '../../utils';
import type { AgentLoopEvent } from './loop/type';
import type { AgentLoopToolCatalog } from './tools';
import { AgentNodeResponseDisplay } from './constants';

type LLMRequestEndEvent = Extract<AgentLoopEvent, { type: 'llm_request_end' }>;
type AfterMessageCompressEvent = Extract<AgentLoopEvent, { type: 'after_message_compress' }>;
type ToolResponseEvent = Extract<AgentLoopEvent, { type: 'tool_response' }>;
type ToolResponseCompressEvent = NonNullable<ToolResponseEvent['toolResponseCompress']>;

export type AgentLoopNodeResponseBase = {
  nodeId: string;
  moduleType: FlowNodeTypeEnum;
};

export const getAgentLoopUsageTotalPoints = (usages: ChatNodeUsageType[] = []) =>
  usages.reduce((sum, item) => sum + (item.totalPoints ?? 0), 0);

/**
 * 构造主 Agent 每次 LLM 请求的运行详情。
 *
 * 不同入口可以使用自己的 nodeId/moduleType，但 requestId、usage、错误和推理字段应保持一致，
 * 避免 workflow 与辅助生成链路各自维护时发生统计口径漂移。
 */
export const createAgentLoopCallNodeResponse = ({
  event,
  node
}: {
  event: LLMRequestEndEvent;
  node: AgentLoopNodeResponseBase;
}): ChatHistoryItemResType => ({
  id: `${node.nodeId}-${event.requestIndex}-${event.requestId}`,
  nodeId: `${node.nodeId}-main_agent-${event.requestIndex}`,
  moduleName: AgentNodeResponseDisplay.master.moduleName,
  moduleType: node.moduleType,
  moduleLogo: AgentNodeResponseDisplay.master.moduleLogo,
  runningTime: event.seconds,
  model: event.modelName,
  llmRequestIds: [event.requestId],
  inputTokens: event.usage?.inputTokens,
  outputTokens: event.usage?.outputTokens,
  totalPoints: event.usage?.totalPoints,
  finishReason: event.finishReason || (event.error ? 'error' : undefined),
  textOutput: event.answerText,
  reasoningText: event.reasoningText,
  ...(event.error ? { errorText: getErrText(event.error) } : {})
});

/**
 * 构造上下文压缩产生的内部 LLM 运行详情。
 */
export const createAgentLoopMessageCompressNodeResponse = ({
  event,
  moduleType
}: {
  event: AfterMessageCompressEvent;
  moduleType: FlowNodeTypeEnum;
}): ChatHistoryItemResType => {
  const requestIds = event.requestIds.filter((requestId): requestId is string => !!requestId);
  const responseId = requestIds[0] || getNanoid();

  return {
    id: responseId,
    nodeId: responseId,
    moduleName: AgentNodeResponseDisplay.contextCompress.moduleName,
    moduleType,
    moduleLogo: AgentNodeResponseDisplay.contextCompress.moduleLogo,
    runningTime: event.seconds,
    model: event.usage?.model,
    llmRequestIds: requestIds.length ? requestIds : undefined,
    inputTokens: event.usage?.inputTokens,
    outputTokens: event.usage?.outputTokens,
    totalPoints: event.usage?.totalPoints
  };
};

/**
 * 构造工具响应压缩产生的内部 LLM 运行详情。
 *
 * 该节点通常作为工具 nodeResponse 的 child，表示模型真正看到的是压缩后的工具结果。
 */
export const createAgentLoopToolResponseCompressNodeResponse = ({
  compress,
  moduleType
}: {
  compress: ToolResponseCompressEvent;
  moduleType: FlowNodeTypeEnum;
}): ChatHistoryItemResType => {
  const requestIds = compress.requestIds.filter((requestId): requestId is string => !!requestId);
  const responseId = requestIds[0] || getNanoid();

  return {
    id: responseId,
    nodeId: responseId,
    moduleName: AgentNodeResponseDisplay.toolResponseCompress.moduleName,
    moduleType,
    moduleLogo: AgentNodeResponseDisplay.toolResponseCompress.moduleLogo,
    runningTime: compress.seconds,
    model: compress.usage.model,
    llmRequestIds: requestIds.length ? requestIds : undefined,
    inputTokens: compress.usage.inputTokens,
    outputTokens: compress.usage.outputTokens,
    totalPoints: compress.usage.totalPoints,
    textOutput: compress.response
  };
};

/**
 * 构造 update_plan/ask_agent 对应的规划 Agent 运行详情。
 */
export const createAgentLoopPlanToolNodeResponse = ({
  event,
  node,
  toolCatalog
}: {
  event: ToolResponseEvent;
  node: AgentLoopNodeResponseBase;
  toolCatalog: AgentLoopToolCatalog;
}): ChatHistoryItemResType | undefined => {
  const askToolName = toolCatalog.askTool?.function.name;
  const updatePlanToolName = toolCatalog.updatePlanTool?.function.name;
  const agentPlanStatus = (() => {
    if (askToolName && event.call.function.name === askToolName) {
      return 'ask_question' as const;
    }
    if (!updatePlanToolName || event.call.function.name !== updatePlanToolName) return;

    const args = parseJsonArgs<{ updates?: Array<{ action?: string }> }>(
      event.call.function.arguments
    );
    const updates = Array.isArray(args?.updates) ? args.updates : [];
    return updates.some((item) => item?.action === 'set_plan' || item?.action === 'replace_plan')
      ? ('set_plan' as const)
      : ('update_plan' as const);
  })();
  if (!agentPlanStatus) return;

  const compressNodeResponse = event.toolResponseCompress
    ? createAgentLoopToolResponseCompressNodeResponse({
        compress: event.toolResponseCompress,
        moduleType: node.moduleType
      })
    : undefined;

  return {
    id: `${node.nodeId}-plan-${event.call.id}`,
    nodeId: `${node.nodeId}-plan-${event.call.id}`,
    moduleName: AgentNodeResponseDisplay.plan.moduleName,
    moduleType: node.moduleType,
    moduleLogo: AgentNodeResponseDisplay.plan.moduleLogo,
    runningTime: event.seconds,
    textOutput: event.response,
    agentPlanStatus,
    ...(compressNodeResponse ? { childrenResponses: [compressNodeResponse] } : {})
  };
};

/**
 * 构造无子流程 nodeResponse 的普通工具运行详情。
 */
export const createAgentLoopToolNodeResponse = ({
  event,
  toolInfo,
  usages
}: {
  event: ToolResponseEvent;
  toolInfo: {
    name: string;
    avatar: string;
    moduleType?: FlowNodeTypeEnum;
  };
  usages?: ChatNodeUsageType[];
}): ChatHistoryItemResType => ({
  id: event.call.id,
  nodeId: event.call.id,
  moduleType: toolInfo.moduleType ?? FlowNodeTypeEnum.tool,
  moduleName: toolInfo.name || event.call.function.name,
  moduleLogo: toolInfo.avatar,
  runningTime: event.seconds,
  toolInput: parseJsonArgs(event.call.function.arguments) || undefined,
  toolRes: event.response,
  totalPoints: getAgentLoopUsageTotalPoints(usages)
});
