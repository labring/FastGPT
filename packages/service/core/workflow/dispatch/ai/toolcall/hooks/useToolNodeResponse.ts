import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { ChildResponseItemType, ToolDispatchSummaryType } from '../type';
import { AgentNodeResponseDisplay } from '../../../../../ai/llm/agentLoop/constants';
import {
  createRuntimeNodeResponseSummary,
  mergeRuntimeNodeResponseSummary,
  summarizeRuntimeNodeResponses
} from '../../../utils';
import type { WorkflowNodeResponseWriter } from '../../../../../chat/nodeResponseStorage';

type ToolResponseCompress = {
  response: string;
  usage: ChatNodeUsageType;
  requestIds: string[];
  seconds: number;
};

/**
 * 构造 ToolCall 内部压缩类 LLM 调用的 nodeResponse。
 *
 * context compress 和 tool response compress 都是 ToolCall 自己的辅助 LLM 调用，
 * 不属于某个真实工具子流程。这里统一生成可写入 writer 的独立节点；只有 context
 * compress 需要保留旧版 compressTextAgent 结构，tool response compress 只展示压缩文本。
 */
const createCompressNodeResponse = ({
  moduleName,
  moduleType,
  usage,
  requestIds,
  seconds,
  textOutput,
  includeCompressTextAgent = true
}: {
  moduleName: string;
  moduleType: FlowNodeTypeEnum;
  usage: ChatNodeUsageType;
  requestIds: string[];
  seconds: number;
  textOutput?: string;
  includeCompressTextAgent?: boolean;
}): ChatHistoryItemResType => {
  const validRequestIds = requestIds.filter(Boolean);
  const id = validRequestIds[0] || getNanoid();

  return {
    id,
    nodeId: id,
    moduleName,
    moduleType,
    moduleLogo: AgentNodeResponseDisplay.contextCompress.moduleLogo,
    runningTime: seconds,
    model: usage.model,
    llmRequestIds: validRequestIds.length ? validRequestIds : undefined,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalPoints: usage.totalPoints,
    textOutput,
    ...(includeCompressTextAgent
      ? {
          compressTextAgent: {
            // 旧数据/异常路径可能缺 token，但前端压缩详情需要数字结构。
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
            totalPoints: usage.totalPoints
          }
        }
      : {})
  };
};

/**
 * 生成上下文压缩节点。
 *
 * 该节点表示 ToolCall 在发起模型请求前对 messages/context 做的压缩，天然属于
 * ToolCall 父节点的直接 child，而不是任何工具调用的 child。
 */
const getContextCompressNodeResponse = ({
  moduleType,
  usage,
  requestIds,
  seconds
}: {
  moduleType: FlowNodeTypeEnum;
  usage: ChatNodeUsageType;
  requestIds: string[];
  seconds: number;
}): ChatHistoryItemResType =>
  createCompressNodeResponse({
    moduleName: AgentNodeResponseDisplay.contextCompress.moduleName,
    moduleType,
    usage,
    requestIds,
    seconds
  });

/**
 * 生成工具响应压缩节点。
 *
 * 工具响应压缩发生在工具执行完成后、结果回填给模型前。按当前极简记录规则，它也作为
 * ToolCall 的直接 child 写入，避免再次包装或改写 child workflow 已经写入的真实工具节点。
 */
const getToolResponseCompressNodeResponse = ({
  moduleType,
  response,
  usage,
  requestIds,
  seconds
}: {
  moduleType: FlowNodeTypeEnum;
  response: string;
  usage: ChatNodeUsageType;
  requestIds: string[];
  seconds: number;
}): ChatHistoryItemResType =>
  createCompressNodeResponse({
    moduleName: AgentNodeResponseDisplay.toolResponseCompress.moduleName,
    moduleType,
    usage,
    requestIds,
    seconds,
    textOutput: response,
    includeCompressTextAgent: false
  });

/**
 * ToolCall 只维护子流程 summary 和压缩节点详情。
 *
 * 普通工具子流程的真实 nodeResponse 由 child workflow 复用共享 writer 直接写库；
 * afterToolCall 不再生成 `call_xxx` wrapper，也不缓存第一层 child nodeResponse。
 *
 * 内置工具是唯一例外：sandbox/file 没有 child workflow writer，因此它们会携带
 * `builtinNodeResponses`，并且只在 afterToolCall 阶段写到 ToolCall 父节点下。
 */
export const useToolNodeResponse = ({
  moduleType,
  nodeResponseWriter,
  nodeResponseParentId
}: {
  moduleType: FlowNodeTypeEnum;
  nodeResponseWriter?: WorkflowNodeResponseWriter;
  nodeResponseParentId?: string;
}) => {
  const toolDispatchSummary: ToolDispatchSummaryType = {
    runtimeNodeResponseSummary: createRuntimeNodeResponseSummary(),
    runTimes: 0,
    toolTotalPoints: 0
  };

  /**
   * 暂存 onRunTool 阶段得到的工具子流程 summary。
   *
   * onRunTool 只负责执行工具；真实 nodeResponse 已经由 child workflow 复用共享 writer 写库。
   * onAfterToolCall 再按 call.id 取回 summary 并入 ToolCall 父节点统计。
   * sandbox/file 这类内置工具没有 child workflow，只在这里额外暂存待写入的单层响应。
   */
  const pendingToolSummaryMap = new Map<string, ChildResponseItemType>();

  /**
   * 合并工具子流程或压缩节点的轻量统计。
   *
   * 这里刻意只接收 ChildResponseItemType，不接收完整 nodeResponse tree：
   * ToolCall 父节点只需要 summary/usage/runTimes 计算展示统计和费用，详情由 writer rows
   * 在读取时重新组合，避免在 ToolCall loop 内保留重复的大对象。
   *
   * `builtinNodeResponses` 是内置工具的专用写入通道。它不是 child workflow 第一层响应缓存，
   * 因为这些工具本身没有 child workflow；为了满足“afterTool 后才写节点”，只能在此处落库。
   */
  const appendToolSummary = (flowResponse?: ChildResponseItemType) => {
    if (!flowResponse) return;

    if (flowResponse.builtinNodeResponses?.length) {
      void nodeResponseWriter?.recordWithParent(
        flowResponse.builtinNodeResponses,
        nodeResponseParentId
      );
    }

    toolDispatchSummary.runtimeNodeResponseSummary = mergeRuntimeNodeResponseSummary(
      toolDispatchSummary.runtimeNodeResponseSummary,
      flowResponse.runtimeNodeResponseSummary
    );
    toolDispatchSummary.runTimes += flowResponse.runTimes || 0;
    toolDispatchSummary.toolTotalPoints += (flowResponse.flowUsages || []).reduce(
      (sum, usage) => sum + usage.totalPoints,
      0
    );
  };

  /**
   * 写入 ToolCall 自己产生的压缩节点，并同步累计它的 summary/usage。
   *
   * compress 节点不是 child workflow 的真实节点，所以必须在这里显式写入；parentId 使用
   * ToolCall 父节点 id，让最终详情中它和真实工具子流程节点处于同一层级。
   */
  const appendCompressNodeResponse = ({
    nodeResponse,
    usage
  }: {
    nodeResponse: ChatHistoryItemResType;
    usage: ChatNodeUsageType;
  }) => {
    void nodeResponseWriter?.recordWithParent([nodeResponse], nodeResponseParentId);

    appendToolSummary({
      runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, [nodeResponse]),
      flowUsages: [usage],
      runTimes: 0
    });
  };

  /**
   * 缓存一次工具执行返回的轻量 summary。
   *
   * 空 summary 不缓存：这通常意味着工具未执行成功或没有产生可统计节点。当前规则下不再
   * 为这种情况补写 fallback wrapper，避免重新引入 `call_xxx` 虚拟工具节点。
   * 内置工具若携带 builtinNodeResponses，也必须等到 afterToolCall 再写库。
   */
  const cacheToolFlowResponse = ({
    call,
    flowResponse
  }: {
    call: ChatCompletionMessageToolCall;
    flowResponse?: ChildResponseItemType;
  }) => {
    if (!flowResponse) return;
    if (!flowResponse.runtimeNodeResponseSummary && !flowResponse.builtinNodeResponses?.length) {
      return;
    }

    pendingToolSummaryMap.set(call.id, flowResponse);
  };

  /**
   * 处理 agentLoop 的 afterToolCall 回调。
   *
   * 这里不写普通工具 nodeResponse：真实工具详情已经由 child workflow 写入。
   * 该函数只做两件事：
   * 1. 合并 onRunTool 阶段暂存的 child workflow summary。
   * 2. 写入 sandbox/file 这类内置工具自己的单层 nodeResponse。
   * 3. 如果发生 tool response compress，额外写入一个 ToolCall 直接 child 压缩节点。
   */
  const appendToolNodeResponse = ({
    call,
    toolResponseCompress
  }: {
    call: ChatCompletionMessageToolCall;
    response?: string;
    errorMessage?: string;
    seconds: number;
    toolResponseCompress?: ToolResponseCompress;
  }) => {
    appendToolSummary(pendingToolSummaryMap.get(call.id));
    pendingToolSummaryMap.delete(call.id);

    if (!toolResponseCompress) return;

    appendCompressNodeResponse({
      nodeResponse: getToolResponseCompressNodeResponse({
        moduleType,
        response: toolResponseCompress.response,
        usage: toolResponseCompress.usage,
        requestIds: toolResponseCompress.requestIds,
        seconds: toolResponseCompress.seconds
      }),
      usage: toolResponseCompress.usage
    });
  };

  /**
   * 交互恢复工具没有新的 LLM tool_call 生命周期。
   *
   * 因此不会再触发 afterToolCall，只能在 runInteractiveTool 完成后直接把续跑子流程的
   * summary 合并进 ToolCall 父节点统计。
   */
  const appendInteractiveToolSummary = (flowResponse: ChildResponseItemType) => {
    appendToolSummary(flowResponse);
  };

  /**
   * 记录 message/context 压缩节点。
   *
   * context compress 发生在 ToolCall 内部模型调用前，不依附于某个工具，所以和
   * tool response compress 一样作为 ToolCall 的直接 child 写入。
   */
  const appendContextCompressNodeResponse = ({
    usage,
    requestIds,
    seconds
  }: {
    usage: ChatNodeUsageType;
    requestIds: string[];
    seconds: number;
  }) => {
    appendCompressNodeResponse({
      nodeResponse: getContextCompressNodeResponse({
        moduleType,
        usage,
        requestIds,
        seconds
      }),
      usage
    });
  };

  return {
    toolDispatchSummary,
    cacheToolFlowResponse,
    appendToolNodeResponse,
    appendInteractiveToolSummary,
    appendContextCompressNodeResponse
  };
};
