import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { AgentLoopEvent } from '../../../../../../ai/llm/agentLoop/interface';
import { AgentNodeResponseDisplay } from '../../domain/constants';
import { parseJsonArgs } from '../../../../../../ai/utils';
import {
  appendAgentLoopCoreChildNodeResponses,
  withAgentLoopCoreChildTotalPoints
} from './children';
import { createAgentLoopCoreCompressNodeResponse } from './compress';

type ToolRunEndEvent = Extract<AgentLoopEvent, { type: 'tool_run_end' }>;
type PlanOperationEvent = Extract<AgentLoopEvent, { type: 'plan_operation' }>;
type AskStartEvent = Extract<AgentLoopEvent, { type: 'ask_start' }>;
type ToolResponseCompressEvent = NonNullable<ToolRunEndEvent['toolResponseCompress']>;
type AgentPlanStatus = NonNullable<ChatHistoryItemResType['agentPlanStatus']>;

type PendingToolResult = {
  usages: ChatNodeUsageType[];
  nodeResponse?: ChatHistoryItemResType;
};

export type AgentLoopCoreNodeResponseToolInfo = {
  name: string;
  avatar?: string;
};

export type CreateAgentLoopCoreNodeResponseEventCollectorParams = {
  node: {
    nodeId: string;
    flowNodeType: FlowNodeTypeEnum;
  };
  nodeResponses?: ChatHistoryItemResType[];
  appendNodeResponse?: (nodeResponse: ChatHistoryItemResType) => void;
  getToolInfo: (name: string) => AgentLoopCoreNodeResponseToolInfo;
};

const getUsageTotalPoints = (usages: ChatNodeUsageType[] = []) =>
  usages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

const getFirstUsage = (event: { usages?: ChatNodeUsageType[] }) => event.usages?.find(Boolean);

/**
 * 创建 agent-loop event 到 workflow nodeResponses 的收集器。
 *
 * 这个 collector 只维护运行详情，不处理 SSE 和 assistantResponses。调用方需要在
 * executeTool 返回后先 cacheToolResult，再把后续 tool_run_end 事件交给 emitEvent。
 */
export const createAgentLoopCoreNodeResponseEventCollector = ({
  node,
  nodeResponses,
  appendNodeResponse,
  getToolInfo
}: CreateAgentLoopCoreNodeResponseEventCollectorParams) => {
  const appendedCallIds = new Set<string>();
  const appendedLlmRequestIds = new Set<string>();
  const appendedCompressRequestKeys = new Set<string>();
  const pendingToolResultMap = new Map<string, PendingToolResult>();
  const append =
    appendNodeResponse ??
    ((nodeResponse: ChatHistoryItemResType) => nodeResponses?.push(nodeResponse));

  const cacheToolResult = ({
    callId,
    usages,
    nodeResponse
  }: {
    callId: string;
    usages: ChatNodeUsageType[];
    nodeResponse?: ChatHistoryItemResType;
  }) => {
    pendingToolResultMap.set(callId, {
      usages,
      nodeResponse
    });
  };

  const createToolResponseCompressNodeResponse = (
    compress: ToolResponseCompressEvent
  ): ChatHistoryItemResType => {
    return createAgentLoopCoreCompressNodeResponse({
      moduleName: AgentNodeResponseDisplay.toolResponseCompress.moduleName,
      moduleType: node.flowNodeType,
      moduleLogo: AgentNodeResponseDisplay.toolResponseCompress.moduleLogo,
      usage: compress.usage,
      requestIds: compress.requestIds,
      seconds: compress.seconds,
      textOutput: compress.response
    });
  };

  const getPlanOperationStatus = (event: PlanOperationEvent): AgentPlanStatus => {
    if (event.operation === 'set_plan') {
      return 'set_plan';
    }

    return 'update_plan';
  };

  const createFallbackToolNodeResponse = ({
    call,
    response,
    usages,
    seconds
  }: {
    call: ToolRunEndEvent['call'];
    response: string;
    usages?: ChatNodeUsageType[];
    seconds: number;
  }): ChatHistoryItemResType => {
    const toolInfo = getToolInfo(call.function.name);
    const parsedInput = parseJsonArgs(call.function.arguments);

    return {
      id: call.id,
      nodeId: call.id,
      moduleType: FlowNodeTypeEnum.tool,
      moduleName: toolInfo.name || call.function.name,
      moduleLogo: toolInfo.avatar,
      runningTime: seconds,
      toolInput: parsedInput || undefined,
      toolRes: response,
      totalPoints: getUsageTotalPoints(usages)
    };
  };

  const appendPlanOperationNodeResponse = (event: PlanOperationEvent) => {
    if (!event.id) return;
    if (appendedCallIds.has(event.id)) return;
    appendedCallIds.add(event.id);

    append(
      withAgentLoopCoreChildTotalPoints({
        id: `${node.nodeId}-plan-${event.id}`,
        nodeId: `${node.nodeId}-plan-${event.id}`,
        moduleName: AgentNodeResponseDisplay.plan.moduleName,
        moduleType: node.flowNodeType,
        moduleLogo: AgentNodeResponseDisplay.plan.moduleLogo,
        runningTime: event.seconds,
        textOutput: event.message,
        agentPlanStatus: getPlanOperationStatus(event)
      })
    );
  };

  const appendAskNodeResponse = (event: AskStartEvent) => {
    if (!event.id) return;
    if (appendedCallIds.has(event.id)) return;
    appendedCallIds.add(event.id);

    append(
      withAgentLoopCoreChildTotalPoints({
        id: `${node.nodeId}-ask-${event.id}`,
        nodeId: `${node.nodeId}-ask-${event.id}`,
        moduleName: AgentNodeResponseDisplay.ask.moduleName,
        moduleType: node.flowNodeType,
        moduleLogo: AgentNodeResponseDisplay.ask.moduleLogo,
        runningTime: event.seconds,
        textOutput: event.ask.question
      })
    );
  };

  const appendAgentCallNodeResponse = (
    event: Extract<AgentLoopEvent, { type: 'llm_request_end' }>
  ) => {
    if (appendedLlmRequestIds.has(event.requestId)) return;
    appendedLlmRequestIds.add(event.requestId);

    const usage = getFirstUsage(event);
    append({
      id: `${node.nodeId}-${event.requestIndex}-${event.requestId}`,
      nodeId: `${node.nodeId}-main_agent-${event.requestIndex}`,
      moduleName: AgentNodeResponseDisplay.master.moduleName,
      moduleType: node.flowNodeType,
      moduleLogo: AgentNodeResponseDisplay.master.moduleLogo,
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

  const appendMessageCompressNodeResponse = (
    event: Extract<AgentLoopEvent, { type: 'after_message_compress' }>
  ) => {
    const requestKey = event.requestIds.join(',');
    if (requestKey && appendedCompressRequestKeys.has(requestKey)) return;
    if (requestKey) appendedCompressRequestKeys.add(requestKey);

    append(
      createAgentLoopCoreCompressNodeResponse({
        moduleName: AgentNodeResponseDisplay.contextCompress.moduleName,
        moduleType: node.flowNodeType,
        moduleLogo: AgentNodeResponseDisplay.contextCompress.moduleLogo,
        usage: getFirstUsage(event),
        requestIds: event.requestIds,
        seconds: event.seconds
      })
    );
  };

  const createToolNodeResponse = (event: ToolRunEndEvent): ChatHistoryItemResType => {
    const pendingResult = pendingToolResultMap.get(event.call.id);
    const toolNodeResponse =
      (event.metadata as ChatHistoryItemResType | undefined) ||
      pendingResult?.nodeResponse ||
      createFallbackToolNodeResponse({
        call: event.call,
        response: event.response,
        usages: pendingResult?.usages,
        seconds: event.seconds
      });
    const compressNodeResponse = event.toolResponseCompress
      ? createToolResponseCompressNodeResponse(event.toolResponseCompress)
      : undefined;

    return appendAgentLoopCoreChildNodeResponses({
      nodeResponse: {
        ...toolNodeResponse,
        runningTime: toolNodeResponse.runningTime ?? event.seconds,
        toolRes: toolNodeResponse.toolRes ?? event.response
      },
      childrenResponses: compressNodeResponse ? [compressNodeResponse] : []
    });
  };

  const appendToolNodeResponse = (event: ToolRunEndEvent) => {
    if (appendedCallIds.has(event.call.id)) return;
    appendedCallIds.add(event.call.id);

    append(createToolNodeResponse(event));
    pendingToolResultMap.delete(event.call.id);
  };

  const emitEvent = (event: AgentLoopEvent) => {
    switch (event.type) {
      case 'llm_request_end':
        appendAgentCallNodeResponse(event);
        return;
      case 'after_message_compress':
        appendMessageCompressNodeResponse(event);
        return;
      case 'tool_run_end':
        appendToolNodeResponse(event);
        return;
      case 'plan_operation':
        appendPlanOperationNodeResponse(event);
        return;
      case 'ask_start':
        appendAskNodeResponse(event);
        return;
      default:
        return;
    }
  };

  return {
    cacheToolResult,
    emitEvent
  };
};
