import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { ChildResponseItemType } from '../type';
import { AgentNodeResponseDisplay } from '../../../../../ai/llm/agentLoop/constants';
import { parseJsonArgs } from '../../../../../ai/utils';

type ToolInfo = {
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
 * 创建 ToolCall 内部压缩类 LLM 调用的 nodeResponse。
 * context/message compress 和 tool response compress 展示结构基本一致，
 * 区别只在 moduleName、textOutput 和是否需要旧版 compressTextAgent 字段。
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
            /**
             * 旧数据/异常路径可能缺 token，但前端压缩详情需要数字结构。
             */
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
            totalPoints: usage.totalPoints
          }
        }
      : {})
  };
};

/**
 * 生成 ToolCall 节点自己的 message/context compress 运行详情。
 * 这类压缩不属于某个具体工具，因此后续会作为 ToolCall 的独立 child flow response。
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
}): ChatHistoryItemResType => {
  return createCompressNodeResponse({
    moduleName: AgentNodeResponseDisplay.contextCompress.moduleName,
    moduleType,
    usage,
    requestIds,
    seconds
  });
};

/**
 * 生成 tool response compress 的 child 记录。
 * 它只服务于某一次工具调用，不再作为 ToolCall 下的平级 nodeResponse 展示。
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
}): ToolResponseCompressRecord => {
  return {
    nodeResponse: createCompressNodeResponse({
      moduleName: AgentNodeResponseDisplay.toolResponseCompress.moduleName,
      moduleType,
      usage,
      requestIds,
      seconds,
      textOutput: response,
      includeCompressTextAgent: false
    }),
    usage
  };
};

/**
 * 兜底生成最小工具 nodeResponse。
 * 部分工具没有子 workflow flowResponse，或工具执行异常时拿不到完整子响应；
 * 这里仍保留 call.id、入参、响应文本和错误信息，保证运行详情能对应到每次 tool request。
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
}): ChildResponseItemType => {
  return {
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
  };
};

/**
 * 把 tool response compress 挂到工具 flowResponse 的最后一个 nodeResponse 上。
 * 工具 workflow 可能包含多个内部节点，最后一个节点代表最终工具响应，更适合作为压缩 child 的父节点。
 */
const appendToolResponseCompressRecord = ({
  flowResponse,
  compressRecord
}: {
  flowResponse: ChildResponseItemType;
  compressRecord: ToolResponseCompressRecord;
}): ChildResponseItemType => {
  const targetIndex = flowResponse.flowResponses.length - 1;
  if (targetIndex < 0) return flowResponse;

  return {
    ...flowResponse,
    flowResponses: flowResponse.flowResponses.map((item, index) => {
      if (index !== targetIndex) return item;

      return {
        ...item,
        childrenResponses: [...(item.childrenResponses || []), compressRecord.nodeResponse]
      };
    }),
    /**
     * 工具响应压缩是该工具调用的内部子消耗，需要并入 flowUsages，
     * 父 ToolCall 节点后续会用这些 usage 汇总 childTotalPoints。
     */
    flowUsages: [...flowResponse.flowUsages, compressRecord.usage]
  };
};

/**
 * 维护 ToolCall 节点内普通工具调用产生的 nodeResponse。
 * onRunTool 阶段只暂存工具 flowResponse，onAfterToolCall 再统一写入并挂载工具响应压缩 child。
 */
export const useToolNodeResponse = ({
  moduleType,
  getToolInfo
}: {
  moduleType: FlowNodeTypeEnum;
  getToolInfo: (name: string) => ToolInfo | undefined;
}) => {
  /**
   * 返回给 ToolCall dispatcher 的收集容器。
   * hook 内部直接 push，调用方持有同一个数组引用，后续汇总 child responses/usage 时能拿到最终结果。
   */
  const toolRunResponses: ChildResponseItemType[] = [];

  /**
   * onRunTool 与 onAfterToolCall 分阶段触发：前者先拿到工具 workflow 响应，
   * 后者才拿到最终 tool response 和可能存在的压缩结果。这里用 call.id 暂存中间态。
   */
  const pendingToolFlowResponseMap = new Map<string, ChildResponseItemType>();

  /**
   * onRunTool 只能拿到工具 workflow 的执行结果，拿不到压缩后的最终 tool response。
   * 所以先按 call.id 暂存，等 onAfterToolCall 再统一落 nodeResponse。
   */
  const cacheToolFlowResponse = ({
    call,
    flowResponse
  }: {
    call: ChatCompletionMessageToolCall;
    flowResponse?: ChildResponseItemType;
  }) => {
    if (!flowResponse) return;

    pendingToolFlowResponseMap.set(call.id, flowResponse);
  };

  /**
   * 推送一个 tool response，只在 tool_response/afterToolCall 阶段真正写入 nodeResponse，
   * 确保工具文本、错误信息和 tool response compress child 都已经齐全。
   */
  const appendToolNodeResponse = ({
    call,
    response,
    errorMessage,
    seconds,
    toolResponseCompress
  }: {
    call: ChatCompletionMessageToolCall;
    response?: string;
    errorMessage?: string;
    seconds: number;
    toolResponseCompress?: ToolResponseCompress;
  }) => {
    const pendingFlowResponse = pendingToolFlowResponseMap.get(call.id);

    /**
     * 文件工具、sandbox 工具或异常路径不一定有完整 workflow response。
     * 缺失时补一个最小工具 nodeResponse，保证“每次 tool request 都有记录”。
     */
    const baseFlowResponse =
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

    /**
     * tool response 压缩属于本次工具调用的内部 LLM 消耗；
     * 它跟随工具 nodeResponse 作为 childrenResponses 展示，不再单独生成平级记录。
     */
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

  /**
   * 推送非普通工具执行产生的 flowResponse。
   * 例如系统交互类工具已经在上游构造好完整运行详情，这里只负责并入 ToolCall 汇总列表。
   */
  const appendToolFlowResponse = (flowResponse: ChildResponseItemType) => {
    toolRunResponses.push(flowResponse);
  };

  /**
   * message/context compress 是 ToolCall 节点自己的 LLM 子调用。
   * 它没有关联到某个具体工具，因此作为 ToolCall 的独立 child flow response 记录。
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
    appendToolFlowResponse,
    appendContextCompressNodeResponse
  };
};
