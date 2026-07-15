import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import {
  createAgentLoopPlanToolNodeResponse,
  createAgentLoopToolNodeResponse,
  createAgentLoopToolResponseCompressNodeResponse,
  type AgentLoopEvent,
  type AgentLoopToolCatalog
} from '../../../../../ai/llm/agentLoop';
import type { GetSubAppInfoFnType } from '../type';

type ToolResponseEvent = Extract<AgentLoopEvent, { type: 'tool_response' }>;
type ToolResponseCompressEvent = NonNullable<ToolResponseEvent['toolResponseCompress']>;

type PendingToolResult = {
  usages: ChatNodeUsageType[];
  nodeResponse?: ChatHistoryItemResType;
};

/**
 * 维护 agent-loop 工具调用产生的 workflow nodeResponse。
 * 包含普通工具、plan/ask 内部工具，以及工具响应压缩 child 的挂载。
 */
export const useToolNodeResponse = ({
  node,
  nodeResponses,
  appendNodeResponse = (nodeResponse) => {
    nodeResponses.push(nodeResponse);
  },
  toolCatalog,
  getSubAppInfo
}: {
  node: {
    nodeId: string;
    flowNodeType: FlowNodeTypeEnum;
  };
  nodeResponses: ChatHistoryItemResType[];
  appendNodeResponse?: (nodeResponse: ChatHistoryItemResType) => void;
  toolCatalog: AgentLoopToolCatalog;
  getSubAppInfo: GetSubAppInfoFnType;
}) => {
  /**
   * tool_response 是工具 nodeResponse 的统一落点；同一个 callId 重复事件只保留第一次。
   * 这主要防御流恢复、异常重放或未来事件扩展导致同一次工具调用重复写入。
   */
  const appendedCallIds = new Set<string>();
  /**
   * executeTool 返回的是工具调度阶段的数据；真正可展示的工具响应文本和压缩结果要等
   * agentLoop 发出 tool_response 后才能确定，所以这里先按 callId 缓存工具运行结果。
   */
  const pendingToolResultMap = new Map<string, PendingToolResult>();

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

  const createToolResponseCompressNodeResponse = (compress: ToolResponseCompressEvent) =>
    createAgentLoopToolResponseCompressNodeResponse({
      compress,
      moduleType: node.flowNodeType
    });

  const createFallbackToolNodeResponse = ({
    event,
    usages
  }: {
    event: ToolResponseEvent;
    usages?: ChatNodeUsageType[];
  }): ChatHistoryItemResType => {
    /**
     * 并非所有工具都会返回 workflow 子流程的 nodeResponse。
     * 例如异常路径、只返回文本的内部工具，需要补一个最小可诊断记录。
     */
    const subInfo = getSubAppInfo(event.call.function.name);
    return createAgentLoopToolNodeResponse({
      event,
      toolInfo: {
        name: subInfo.name,
        avatar: subInfo.avatar
      },
      usages
    });
  };

  const createToolNodeResponse = (event: ToolResponseEvent): ChatHistoryItemResType => {
    const pendingResult = pendingToolResultMap.get(event.call.id);
    /**
     * 优先使用工具调度器返回的完整 nodeResponse；没有时再使用 fallback。
     * fallback 只保证基本输入、输出和计费信息可见，不承载子流程详情。
     */
    const toolNodeResponse =
      pendingResult?.nodeResponse ||
      createFallbackToolNodeResponse({
        event,
        usages: pendingResult?.usages
      });
    const compressNodeResponse = event.toolResponseCompress
      ? createToolResponseCompressNodeResponse(event.toolResponseCompress)
      : undefined;

    /**
     * tool response compress 是本次工具调用的内部 LLM 子步骤。
     * 它必须跟随工具节点作为 child 展示，不能作为顶层 nodeResponse，否则会和工具调用割裂。
     */
    const childrenResponses = [
      ...(toolNodeResponse.childrenResponses || []),
      ...(compressNodeResponse ? [compressNodeResponse] : [])
    ];

    return {
      ...toolNodeResponse,
      runningTime: toolNodeResponse.runningTime ?? event.seconds,
      toolRes: toolNodeResponse.toolRes ?? event.response,
      ...(childrenResponses.length > 0 ? { childrenResponses } : {})
    };
  };

  /**
   * 推送一个 tool response, 只在 tool_response 阶段真正写入 nodeResponse，确保工具文本、错误和压缩 child 都已齐全。
   */
  const appendToolNodeResponse = (event: ToolResponseEvent) => {
    if (appendedCallIds.has(event.call.id)) return;
    appendedCallIds.add(event.call.id);

    const planNodeResponse = createAgentLoopPlanToolNodeResponse({
      event,
      node: {
        nodeId: node.nodeId,
        moduleType: node.flowNodeType
      },
      toolCatalog
    });
    if (planNodeResponse) {
      appendNodeResponse(planNodeResponse);
      return;
    }

    const toolNodeResponse = createToolNodeResponse(event);
    appendNodeResponse(toolNodeResponse);
    pendingToolResultMap.delete(event.call.id);
  };

  return {
    cacheToolResult,
    appendToolNodeResponse
  };
};
