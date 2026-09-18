import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { AgentNodeResponseDisplay } from '../../domain/constants';
import { parseJsonArgs } from '../../../../../../ai/utils';
import type { DispatchFlowResponse } from '../../../../type';
import { createAgentLoopCoreCompressNodeResponse } from './compress';
import type { AgentLoopCoreToolDisplayInfo } from '../../domain/toolInfo';
import {
  createWorkflowRuntimeSummary,
  mergeWorkflowRuntimeSummary
} from '../../../../utils/summary';

export type AgentLoopCoreToolRunFlowResponse = {
  flowResponses: NonNullable<DispatchFlowResponse['flatNodeResponses']>;
  workflowRuntimeSummary?: DispatchFlowResponse['workflowRuntimeSummary'];
  runTimes: DispatchFlowResponse['runTimes'];
  flowUsages: DispatchFlowResponse['flowUsages'];
};

export type AgentLoopCoreToolRunFlowResponsesSummary = {
  runTimes: number;
  toolDetail: NonNullable<DispatchFlowResponse['flatNodeResponses']>;
  toolTotalPoints: number;
  workflowRuntimeSummary: DispatchFlowResponse['workflowRuntimeSummary'];
};

type ToolResponseCompress = {
  response: string;
  modelName: string;
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
  runTimes: responses.reduce((sum, item) => sum + (item.runTimes ?? 0), 0),
  toolDetail: responses.flatMap((item) => item.flowResponses),
  toolTotalPoints: responses
    .flatMap((item) => item.flowUsages)
    .reduce((sum, item) => sum + item.totalPoints, 0),
  workflowRuntimeSummary: responses.reduce(
    (currentSummary, response) =>
      mergeWorkflowRuntimeSummary({
        currentSummary,
        workflowRuntimeSummary: response.workflowRuntimeSummary
      }),
    createWorkflowRuntimeSummary()
  )
});

/**
 * 生成工具节点自身的 message/context compress 运行详情。
 * ToolCall 和简化 Agent 都需要把这类压缩作为父节点下的独立 child flowResponse 展示。
 */
const getContextCompressNodeResponse = ({
  moduleType,
  modelName,
  usage,
  requestIds,
  seconds
}: {
  moduleType: FlowNodeTypeEnum;
  modelName: string;
  usage: ChatNodeUsageType;
  requestIds: string[];
  seconds: number;
}): ChatHistoryItemResType =>
  createAgentLoopCoreCompressNodeResponse({
    moduleName: AgentNodeResponseDisplay.contextCompress.moduleName,
    moduleType,
    modelName,
    usage,
    requestIds,
    seconds,
    includeCompressTextAgent: true
  });

/** 生成 tool response compress 的兼容详情记录，供无 sink 的调试路径保留。 */
const getToolResponseCompressRecord = ({
  moduleType,
  response,
  modelName,
  usage,
  requestIds,
  seconds
}: {
  moduleType: FlowNodeTypeEnum;
  response: string;
  modelName: string;
  usage: ChatNodeUsageType;
  requestIds: string[];
  seconds: number;
}): ToolResponseCompressRecord => ({
  nodeResponse: createAgentLoopCoreCompressNodeResponse({
    moduleName: AgentNodeResponseDisplay.toolResponseCompress.moduleName,
    moduleType,
    modelName,
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
  seconds,
  usages = []
}: {
  call: ChatCompletionMessageToolCall;
  toolName?: string;
  toolAvatar?: string;
  response: string;
  errorMessage?: string;
  seconds: number;
  usages?: ChatNodeUsageType[];
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
      totalPoints: usages.reduce((sum, usage) => sum + (usage.totalPoints || 0), 0),
      ...(errorMessage ? { errorText: errorMessage } : {})
    }
  ],
  flowUsages: usages,
  runTimes: 0
});

/**
 * 把 tool response compress 作为工具 response 的平级详情记录。
 * parentId 只表达展示层级，不再让 summary 通过 childrenResponses 递归读取 token。
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

  const targetResponse = flowResponse.flowResponses[targetIndex];
  return {
    ...flowResponse,
    flowResponses: [
      ...flowResponse.flowResponses,
      {
        ...compressRecord.nodeResponse,
        parentId: targetResponse.id
      }
    ],
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
  getToolInfo: (name: string) => AgentLoopCoreToolDisplayInfo | undefined;
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
    const toolNode = getToolInfo(call.function.name);
    const fallbackFlowResponse = getFallbackToolFlowResponse({
      call,
      toolName: toolNode?.name,
      toolAvatar: toolNode?.avatar,
      response: response || '',
      errorMessage,
      seconds,
      usages
    });
    const normalizedNodeResponse = nodeResponse
      ? {
          ...nodeResponse,
          runningTime: nodeResponse.runningTime ?? seconds,
          toolRes: nodeResponse.toolRes ?? response,
          totalPoints:
            nodeResponse.totalPoints ??
            (usages || []).reduce((sum, usage) => sum + (usage.totalPoints || 0), 0),
          ...(errorMessage ? { errorText: errorMessage } : {})
        }
      : fallbackFlowResponse.flowResponses[0];
    const completedPendingFlowResponse = (() => {
      if (!pendingFlowResponse || !errorMessage) return pendingFlowResponse;
      if (pendingFlowResponse.flowResponses.some((item) => item.errorText)) {
        return pendingFlowResponse;
      }

      const failedNodeIndex = pendingFlowResponse.flowResponses.length - 1;
      if (failedNodeIndex < 0) {
        return {
          ...pendingFlowResponse,
          flowResponses: [normalizedNodeResponse]
        };
      }

      // 子流程已产生节点但未标记错误时，将失败结果落到最终节点，避免额外造一条重复计费记录。
      return {
        ...pendingFlowResponse,
        flowResponses: pendingFlowResponse.flowResponses.map((item, index) =>
          index === failedNodeIndex
            ? {
                ...item,
                toolRes: item.toolRes ?? response,
                errorText: errorMessage
              }
            : item
        )
      };
    })();
    const baseFlowResponse =
      completedPendingFlowResponse ||
      (normalizedNodeResponse
        ? {
            flowResponses: [normalizedNodeResponse],
            flowUsages: usages || [],
            runTimes: 0
          }
        : undefined) ||
      fallbackFlowResponse;

    const completedFlowResponse = toolResponseCompress
      ? appendToolResponseCompressRecord({
          flowResponse: baseFlowResponse,
          compressRecord: getToolResponseCompressRecord({
            moduleType,
            response: toolResponseCompress.response,
            modelName: toolResponseCompress.modelName,
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
    modelName,
    usage,
    requestIds,
    contextCheckpoint,
    seconds
  }: {
    modelName: string;
    usage: ChatNodeUsageType;
    requestIds: string[];
    contextCheckpoint?: string;
    seconds: number;
  }) => {
    const requestKey = requestIds.join(',') || contextCheckpoint;
    if (requestKey && appendedContextCompressKeys.has(requestKey)) return;
    if (requestKey) appendedContextCompressKeys.add(requestKey);

    toolRunResponses.push({
      flowResponses: [
        getContextCompressNodeResponse({
          moduleType,
          modelName,
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
