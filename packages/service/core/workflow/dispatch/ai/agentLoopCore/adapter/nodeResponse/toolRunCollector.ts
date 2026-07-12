import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { AgentNodeResponseDisplay } from '../../domain/constants';
import { parseJsonArgs } from '../../../../../../ai/utils';
import type { DispatchFlowResponse } from '../../../../type';
import { withAgentLoopCoreChildTotalPoints } from './children';
import { createAgentLoopCoreCompressNodeResponse } from './compress';

export type AgentLoopCoreToolRunFlowResponse = {
  flowResponses: NonNullable<DispatchFlowResponse['flatNodeResponses']>;
  runtimeNodeResponseSummary?: DispatchFlowResponse['runtimeNodeResponseSummary'];
  runTimes: DispatchFlowResponse['runTimes'];
  flowUsages: DispatchFlowResponse['flowUsages'];
};

export type AgentLoopCoreToolRunFlowResponsesSummary = {
  runTimes: number;
  toolDetail: NonNullable<DispatchFlowResponse['flatNodeResponses']>;
  toolTotalPoints: number;
};

export type AgentLoopCoreToolRunInfo = {
  name: string;
  avatar?: string;
};

type ToolResponseCompress = {
  response: string;
  usage: ChatNodeUsageType;
  requestIds: string[];
  seconds: number;
};

type ToolResponseCompressRecord = {
  nodeResponse: ChatHistoryItemResType;
  usage: ChatNodeUsageType;
};

/**
 * 汇总 ToolCall 子流程运行详情，供节点外壳组装 nodeResponse。
 *
 * core collector 负责维护 flowResponses/flowUsages/runTimes，外壳只需要读取这个摘要；
 * 这样 ToolCall 不再重复理解子流程详情数组的内部结构。
 */
export const summarizeAgentLoopCoreToolRunFlowResponses = (
  responses: AgentLoopCoreToolRunFlowResponse[]
): AgentLoopCoreToolRunFlowResponsesSummary => ({
  runTimes: responses.reduce(
    (sum, item) => sum + (item.runTimes || item.runtimeNodeResponseSummary?.runningTime || 0),
    0
  ),
  toolDetail: responses.flatMap((item) => item.flowResponses),
  toolTotalPoints: responses
    .flatMap((item) => item.flowUsages)
    .reduce((sum, item) => sum + item.totalPoints, 0)
});

/**
 * 生成工具节点自身的 message/context compress 运行详情。
 * ToolCall 和简化 Agent 都需要把这类压缩作为父节点下的独立 child flowResponse 展示。
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
  createAgentLoopCoreCompressNodeResponse({
    moduleName: AgentNodeResponseDisplay.contextCompress.moduleName,
    moduleType,
    usage,
    requestIds,
    seconds,
    includeCompressTextAgent: true
  });

/**
 * 生成 tool response compress 的 child 记录。
 * 它只归属某次工具调用，不作为平级 nodeResponse 展示。
 */
const getToolResponseCompressRecord = ({
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
}): ToolResponseCompressRecord => ({
  nodeResponse: createAgentLoopCoreCompressNodeResponse({
    moduleName: AgentNodeResponseDisplay.toolResponseCompress.moduleName,
    moduleType,
    usage,
    requestIds,
    seconds,
    textOutput: response,
    includeCompressTextAgent: false
  }),
  usage
});

/**
 * 兜底生成最小工具 nodeResponse。
 * 当工具没有子 workflow flowResponse，或异常路径缺少完整子响应时，仍保留 call id、入参和响应。
 */
const getFallbackToolFlowResponse = ({
  call,
  toolName,
  toolAvatar,
  response,
  errorMessage,
  seconds
}: {
  call: ChatCompletionMessageToolCall;
  toolName?: string;
  toolAvatar?: string;
  response: string;
  errorMessage?: string;
  seconds: number;
}): AgentLoopCoreToolRunFlowResponse => ({
  flowResponses: [
    {
      id: call.id,
      nodeId: call.id,
      moduleType: FlowNodeTypeEnum.tool,
      moduleName: toolName || call.function.name,
      moduleLogo: toolAvatar,
      toolId: call.function.name,
      toolInput: parseJsonArgs(call.function.arguments) || undefined,
      toolRes: response,
      runningTime: seconds,
      totalPoints: 0,
      ...(errorMessage ? { errorText: errorMessage } : {})
    }
  ],
  flowUsages: [],
  runTimes: seconds
});

/**
 * 把 tool response compress 挂到工具 flowResponse 的最后一个 nodeResponse 上。
 * 子 workflow 可能包含多个内部节点，最后一个节点代表最终工具响应，更适合作为压缩 child 的父节点。
 */
const appendToolResponseCompressRecord = ({
  flowResponse,
  compressRecord
}: {
  flowResponse: AgentLoopCoreToolRunFlowResponse;
  compressRecord: ToolResponseCompressRecord;
}): AgentLoopCoreToolRunFlowResponse => {
  const targetIndex = flowResponse.flowResponses.length - 1;
  if (targetIndex < 0) return flowResponse;

  return {
    ...flowResponse,
    flowResponses: flowResponse.flowResponses.map((item, index) => {
      if (index !== targetIndex) return item;

      return withAgentLoopCoreChildTotalPoints({
        ...item,
        childrenResponses: [...(item.childrenResponses || []), compressRecord.nodeResponse]
      });
    }),
    flowUsages: [...flowResponse.flowUsages, compressRecord.usage]
  };
};

/**
 * 创建 agent-loop 工具运行详情收集器。
 *
 * 这个 collector 面向“父节点内的工具子流程详情”数组，不处理 SSE 或 assistantResponses。
 * executeTool 阶段先缓存真实子流程 flowResponse；tool_run_end 阶段再写入最终响应和压缩 child。
 */
export const createAgentLoopCoreToolRunResponseCollector = ({
  moduleType,
  getToolInfo
}: {
  moduleType: FlowNodeTypeEnum;
  getToolInfo: (name: string) => AgentLoopCoreToolRunInfo | undefined;
}) => {
  const toolRunResponses: AgentLoopCoreToolRunFlowResponse[] = [];
  const pendingToolFlowResponseMap = new Map<string, AgentLoopCoreToolRunFlowResponse>();
  const completedToolCallIds = new Set<string>();
  const appendedContextCompressKeys = new Set<string>();

  const cacheToolFlowResponse = ({
    callId,
    flowResponse
  }: {
    callId: string;
    flowResponse?: AgentLoopCoreToolRunFlowResponse;
  }) => {
    if (!flowResponse) return;
    pendingToolFlowResponseMap.set(callId, flowResponse);
  };

  const appendToolNodeResponse = ({
    call,
    response,
    errorMessage,
    seconds,
    usages,
    nodeResponse,
    toolResponseCompress
  }: {
    call: ChatCompletionMessageToolCall;
    response?: string;
    errorMessage?: string;
    seconds: number;
    usages?: ChatNodeUsageType[];
    nodeResponse?: ChatHistoryItemResType;
    toolResponseCompress?: ToolResponseCompress;
  }) => {
    if (completedToolCallIds.has(call.id)) return;
    completedToolCallIds.add(call.id);

    const pendingFlowResponse = pendingToolFlowResponseMap.get(call.id);
    const baseFlowResponse =
      (nodeResponse
        ? {
            flowResponses: [nodeResponse],
            flowUsages: usages || [],
            runTimes: seconds
          }
        : undefined) ||
      pendingFlowResponse ||
      (() => {
        const toolNode = getToolInfo(call.function.name);

        return getFallbackToolFlowResponse({
          call,
          toolName: toolNode?.name,
          toolAvatar: toolNode?.avatar,
          response: response || '',
          errorMessage,
          seconds
        });
      })();

    const completedFlowResponse = toolResponseCompress
      ? appendToolResponseCompressRecord({
          flowResponse: baseFlowResponse,
          compressRecord: getToolResponseCompressRecord({
            moduleType,
            response: toolResponseCompress.response,
            usage: toolResponseCompress.usage,
            requestIds: toolResponseCompress.requestIds,
            seconds: toolResponseCompress.seconds
          })
        })
      : baseFlowResponse;

    toolRunResponses.push(completedFlowResponse);
    pendingToolFlowResponseMap.delete(call.id);
  };

  const appendContextCompressNodeResponse = ({
    usage,
    requestIds,
    seconds
  }: {
    usage: ChatNodeUsageType;
    requestIds: string[];
    seconds: number;
  }) => {
    const requestKey = requestIds.join(',');
    if (requestKey && appendedContextCompressKeys.has(requestKey)) return;
    if (requestKey) appendedContextCompressKeys.add(requestKey);

    toolRunResponses.push({
      flowResponses: [
        getContextCompressNodeResponse({
          moduleType,
          usage,
          requestIds,
          seconds
        })
      ],
      flowUsages: [usage],
      runTimes: 0
    });
  };

  return {
    toolRunResponses,
    cacheToolFlowResponse,
    appendToolNodeResponse,
    appendContextCompressNodeResponse
  };
};
