import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { AgentLoopEvent, AgentLoopToolCatalog } from '../../../../../ai/llm/agentLoop';
import { AgentNodeResponseDisplay } from '../../../../../ai/llm/agentLoop/constants';
import { parseJsonArgs } from '../../../../../ai/utils';
import type { GetSubAppInfoFnType } from '../type';

type ToolResponseEvent = Extract<AgentLoopEvent, { type: 'tool_response' }>;
type ToolResponseCompressEvent = NonNullable<ToolResponseEvent['toolResponseCompress']>;
type AgentPlanStatus = NonNullable<ChatHistoryItemResType['agentPlanStatus']>;

type PendingToolResult = {
  usages: ChatNodeUsageType[];
  nodeResponse?: ChatHistoryItemResType;
};

const getUsageTotalPoints = (usages: ChatNodeUsageType[] = []) =>
  usages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

const getChildrenTotalPoints = (childrenResponses: ChatHistoryItemResType[] = []) =>
  childrenResponses.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

/**
 * 维护 agent-loop 工具调用产生的 workflow nodeResponse。
 * 包含普通工具、plan/ask 内部工具，以及工具响应压缩 child 的挂载。
 */
export const useToolNodeResponse = ({
  node,
  nodeResponses,
  toolCatalog,
  getSubAppInfo
}: {
  node: {
    nodeId: string;
    flowNodeType: FlowNodeTypeEnum;
  };
  nodeResponses: ChatHistoryItemResType[];
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

  const createToolResponseCompressNodeResponse = (
    compress: ToolResponseCompressEvent
  ): ChatHistoryItemResType => {
    /**
     * requestId 由每次内部 LLM 调用生成，这里只过滤空值，不做跨事件去重。
     */
    const requestIds = compress.requestIds.filter((requestId): requestId is string => !!requestId);
    const responseId = requestIds[0] || getNanoid();
    return {
      id: responseId,
      nodeId: responseId,
      moduleName: AgentNodeResponseDisplay.toolResponseCompress.moduleName,
      moduleType: node.flowNodeType,
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

  const withChildTotalPoints = (nodeResponse: ChatHistoryItemResType): ChatHistoryItemResType => {
    /**
     * childrenResponses 可能来自原工具 nodeResponse，也可能是本 hook 追加的压缩 child。
     * 每次返回前重算 childTotalPoints，避免沿用旧值导致父节点消耗展示不准。
     */
    const restNodeResponse = { ...nodeResponse };
    delete restNodeResponse.childTotalPoints;

    const childTotalPoints = getChildrenTotalPoints(nodeResponse.childrenResponses);
    return {
      ...restNodeResponse,
      ...(childTotalPoints > 0 ? { childTotalPoints } : {})
    };
  };

  const getUpdatePlanStatus = (call: ToolResponseEvent['call']): AgentPlanStatus => {
    /**
     * update_plan 既可能是首次设置/替换计划，也可能是状态更新。
     * 前端依赖 agentPlanStatus 决定展示文案，因此需要从工具参数里区分。
     */
    const args = parseJsonArgs<{ updates?: Array<{ action?: string }> }>(call.function.arguments);
    const updates = Array.isArray(args?.updates) ? args.updates : [];

    if (updates.some((item) => item?.action === 'set_plan' || item?.action === 'replace_plan')) {
      return 'set_plan';
    }

    return 'update_plan';
  };

  const getPlanToolStatus = (call: ToolResponseEvent['call']): AgentPlanStatus | undefined => {
    const askToolName = toolCatalog.askTool?.function.name;
    const updatePlanToolName = toolCatalog.updatePlanTool?.function.name;

    if (askToolName && call.function.name === askToolName) {
      return 'ask_question';
    }

    if (updatePlanToolName && call.function.name === updatePlanToolName) {
      return getUpdatePlanStatus(call);
    }
  };

  const createFallbackToolNodeResponse = ({
    call,
    response,
    usages,
    seconds
  }: {
    call: ToolResponseEvent['call'];
    response: string;
    usages?: ChatNodeUsageType[];
    seconds: number;
  }): ChatHistoryItemResType => {
    /**
     * 并非所有工具都会返回 workflow 子流程的 nodeResponse。
     * 例如异常路径、只返回文本的内部工具，需要补一个最小可诊断记录。
     */
    const subInfo = getSubAppInfo(call.function.name);
    const parsedInput = parseJsonArgs(call.function.arguments);

    return {
      id: call.id,
      nodeId: call.id,
      moduleType: FlowNodeTypeEnum.tool,
      moduleName: subInfo.name || call.function.name,
      moduleLogo: subInfo.avatar,
      runningTime: seconds,
      toolInput: parsedInput || undefined,
      toolRes: response,
      totalPoints: getUsageTotalPoints(usages)
    };
  };

  const appendPlanToolNodeResponse = ({
    call,
    response,
    seconds,
    toolResponseCompress
  }: {
    call: ToolResponseEvent['call'];
    response?: string;
    seconds: number;
    toolResponseCompress?: ToolResponseCompressEvent;
  }) => {
    /**
     * ask/update_plan 是 agent-loop 的系统工具，不按普通 FlowNodeTypeEnum.tool 展示。
     * 统一映射成“规划 Agent”节点，避免前端运行详情出现内部函数名。
     */
    const agentPlanStatus = getPlanToolStatus(call);
    if (!agentPlanStatus) return;

    /**
     * 如果 plan/ask 的响应也被压缩，压缩消耗仍挂到这个 plan 节点下。
     */
    const compressNodeResponse = toolResponseCompress
      ? createToolResponseCompressNodeResponse(toolResponseCompress)
      : undefined;
    const childrenResponses = compressNodeResponse ? [compressNodeResponse] : [];

    nodeResponses.push(
      withChildTotalPoints({
        id: `${node.nodeId}-plan-${call.id}`,
        nodeId: `${node.nodeId}-plan-${call.id}`,
        moduleName: AgentNodeResponseDisplay.plan.moduleName,
        moduleType: node.flowNodeType,
        moduleLogo: AgentNodeResponseDisplay.plan.moduleLogo,
        runningTime: seconds,
        textOutput: response,
        agentPlanStatus,
        ...(childrenResponses.length > 0 ? { childrenResponses } : {})
      })
    );
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
        call: event.call,
        response: event.response,
        usages: pendingResult?.usages,
        seconds: event.seconds
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

    return withChildTotalPoints({
      ...toolNodeResponse,
      runningTime: toolNodeResponse.runningTime ?? event.seconds,
      toolRes: toolNodeResponse.toolRes ?? event.response,
      ...(childrenResponses.length > 0 ? { childrenResponses } : {})
    });
  };

  /**
   * 推送一个 tool response, 只在 tool_response 阶段真正写入 nodeResponse，确保工具文本、错误和压缩 child 都已齐全。
   */
  const appendToolNodeResponse = (event: ToolResponseEvent) => {
    if (appendedCallIds.has(event.call.id)) return;
    appendedCallIds.add(event.call.id);

    const agentPlanStatus = getPlanToolStatus(event.call);
    if (agentPlanStatus) {
      appendPlanToolNodeResponse({
        call: event.call,
        response: event.response,
        seconds: event.seconds,
        toolResponseCompress: event.toolResponseCompress
      });
      return;
    }

    const toolNodeResponse = createToolNodeResponse(event);
    nodeResponses.push(toolNodeResponse);
    pendingToolResultMap.delete(event.call.id);
  };

  return {
    cacheToolResult,
    appendToolNodeResponse
  };
};
