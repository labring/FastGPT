import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchFlowResponse } from '../../../../type';
import type { AgentLoopChildrenInteractiveParams } from '../../../../../../ai/llm/agentLoop/interface';
import type { AgentLoopDatasetSearchExecutor } from '../../../../../../ai/llm/agentLoop/interface';
import { parseJsonArgs } from '../../../../../../ai/utils';
import type { AgentLoopCoreToolInfo, AgentLoopCoreToolRunResult } from '../../domain/toolProvider';
import type { AgentLoopCoreToolRunFlowResponse } from '../../adapter/nodeResponse/toolRunCollector';
import { normalizeAgentLoopCoreDatasetSearchResult } from './systemToolHelpers';

export type AgentLoopCoreWorkflowToolRunResponse<TChildrenResponse = unknown> = {
  flowResponses: NonNullable<DispatchFlowResponse['flatNodeResponses']>;
  runtimeNodeResponseSummary?: DispatchFlowResponse['runtimeNodeResponseSummary'];
  flowUsages: DispatchFlowResponse['flowUsages'];
  runTimes?: DispatchFlowResponse[DispatchNodeResponseKeyEnum.runTimes];
  assistantResponses: DispatchFlowResponse[DispatchNodeResponseKeyEnum.assistantResponses];
  workflowInteractiveResponse?: TChildrenResponse;
  toolResponses: DispatchFlowResponse[DispatchNodeResponseKeyEnum.toolResponse];
};

export type CreateAgentLoopCoreWorkflowToolRunnerParams<TChildrenResponse = unknown> = {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  getToolInfo: (name: string) => AgentLoopCoreToolInfo<{ nodeId: string }> | undefined;
  runWorkflowTool: (params: {
    runtimeNodes: RuntimeNodeItemType[];
    runtimeEdges: RuntimeEdgeItemType[];
    lastInteractive?: TChildrenResponse;
  }) => Promise<AgentLoopCoreWorkflowToolRunResponse<TChildrenResponse>>;
  cacheToolFlowResponse?: (args: {
    callId: string;
    flowResponse?: AgentLoopCoreToolRunFlowResponse;
  }) => void;
};

export type CreateAgentLoopCoreWorkflowSystemToolExecutorParams<TChildrenResponse = unknown> = {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  entryNodeId: string;
  runWorkflowTool: CreateAgentLoopCoreWorkflowToolRunnerParams<TChildrenResponse>['runWorkflowTool'];
};

export const updateAgentLoopCoreWorkflowToolInputValue = ({
  params,
  inputs
}: {
  params: Record<string, any>;
  inputs: FlowNodeInputItemType[];
}) => {
  /**
   * Tool workflow 的输入 schema 来自原始节点；这里只覆盖本次 tool call 传入的参数。
   * 使用 ?? 保留 0/false/'' 这类有效值，只有 null/undefined 才回退到节点默认值。
   */
  return inputs.map((input) => ({
    ...input,
    value: params[input.key] ?? input.value
  }));
};

export const formatAgentLoopCoreToolResponse = (toolResponses: any) => {
  if (typeof toolResponses === 'object') {
    return JSON.stringify(toolResponses, null, 2);
  }

  /**
   * 非对象的空结果给 LLM 一个稳定字符串，避免 undefined 被拼进上下文后语义不清。
   */
  return toolResponses ? String(toolResponses) : 'none';
};

/**
 * 这些 runtime edge/node 是为一次 tool workflow 派生出的副本。
 * 初始化阶段直接在副本上标记入口状态，避免后续调度还要维护额外的 entry 集合。
 */
export const initAgentLoopCoreWorkflowToolEdges = (
  edges: RuntimeEdgeItemType[],
  entryNodeIds: string[]
) => {
  edges.forEach((edge) => {
    if (entryNodeIds.includes(edge.target)) {
      edge.status = 'active';
    }
  });
};

export const initAgentLoopCoreWorkflowToolNodes = (
  nodes: RuntimeNodeItemType[],
  entryNodeIds: string[],
  startParams?: Record<string, any>
) => {
  nodes.forEach((node) => {
    if (entryNodeIds.includes(node.nodeId)) {
      node.isEntry = true;
      if (startParams) {
        /**
         * 只给入口节点注入 tool call 参数；非入口节点仍由 workflow 边和上游输出驱动。
         */
        node.inputs = updateAgentLoopCoreWorkflowToolInputValue({
          params: startParams,
          inputs: node.inputs
        });
      }
    }
  });
};

const getAssistantMessages = (
  assistantResponses: DispatchFlowResponse[DispatchNodeResponseKeyEnum.assistantResponses]
): ChatCompletionMessageParam[] =>
  chats2GPTMessages({
    messages: [
      {
        obj: ChatRoleEnum.AI,
        value: assistantResponses
      }
    ],
    reserveId: false,
    reserveTool: true
  });

const toFlowResponse = (
  toolRunResponse: AgentLoopCoreWorkflowToolRunResponse
): AgentLoopCoreToolRunFlowResponse => ({
  flowResponses: toolRunResponse.flowResponses,
  runtimeNodeResponseSummary: toolRunResponse.runtimeNodeResponseSummary,
  flowUsages: toolRunResponse.flowUsages,
  runTimes: toolRunResponse.runTimes ?? 0
});

const toToolRunResult = <TChildrenResponse = unknown>(
  toolRunResponse: AgentLoopCoreWorkflowToolRunResponse<TChildrenResponse>
): {
  result: AgentLoopCoreToolRunResult<TChildrenResponse>;
  flowResponse: AgentLoopCoreToolRunFlowResponse;
} => ({
  result: {
    response: formatAgentLoopCoreToolResponse(toolRunResponse.toolResponses),
    assistantMessages: getAssistantMessages(toolRunResponse.assistantResponses),
    usages: toolRunResponse.flowUsages,
    interactive: toolRunResponse.workflowInteractiveResponse as TChildrenResponse | undefined,
    stop:
      !!toolRunResponse.runtimeNodeResponseSummary?.hasToolStop ||
      toolRunResponse.flowResponses.some((item) => item.toolStop)
  },
  flowResponse: toFlowResponse(toolRunResponse)
});

/**
 * 创建以 workflow runtime node 为入口的 system tool executor。
 *
 * ToolCall 的 dataset_search 虽然由 agent-loop 作为 system tool 注入，但真实执行仍是
 * 一个 workflow 节点子流程。这里复用和普通 workflow tool 一致的入口节点初始化、
 * toolResponses 格式化和 nodeResponse 归一化逻辑。
 */
export const createAgentLoopCoreWorkflowSystemToolExecutor = <TChildrenResponse = unknown>({
  runtimeNodes,
  runtimeEdges,
  entryNodeId,
  runWorkflowTool
}: CreateAgentLoopCoreWorkflowSystemToolExecutorParams<TChildrenResponse>) => {
  const execute: AgentLoopDatasetSearchExecutor = async ({ call }) => {
    const params = parseJsonArgs<Record<string, unknown>>(call.function.arguments) ?? {};
    const query = Array.isArray(params.query)
      ? params.query
      : typeof params.query === 'string'
        ? [params.query]
        : [];

    initAgentLoopCoreWorkflowToolNodes(runtimeNodes, [entryNodeId], {
      ...params,
      [NodeInputKeyEnum.datasetSearchInput]: query,
      [NodeInputKeyEnum.userChatInput]: ''
    });
    initAgentLoopCoreWorkflowToolEdges(runtimeEdges, [entryNodeId]);

    const startTime = Date.now();
    const toolRunResponse = await runWorkflowTool({
      runtimeNodes,
      runtimeEdges
    });
    const result = toToolRunResult<TChildrenResponse>(toolRunResponse).result;

    return normalizeAgentLoopCoreDatasetSearchResult({
      callId: call.id,
      startTime,
      response: result.response,
      usages: result.usages,
      nodeResponse: toFlowResponse(toolRunResponse).flowResponses?.[0]
    });
  };

  return execute;
};

/**
 * 创建 workflow 子工具执行器。
 *
 * ToolCall 和未来的简化 Agent 都可以把“某个 runtime node 作为工具入口运行”的能力交给这里。
 * 节点外壳只负责提供实际 runWorkflow 函数、展示信息和缓存/流式回调。
 */
export const createAgentLoopCoreWorkflowToolRunner = <TChildrenResponse = unknown>({
  runtimeNodes,
  runtimeEdges,
  getToolInfo,
  runWorkflowTool,
  cacheToolFlowResponse
}: CreateAgentLoopCoreWorkflowToolRunnerParams<TChildrenResponse>) => {
  const runTool = async ({
    call
  }: {
    call: ChatCompletionMessageToolCall;
  }): Promise<AgentLoopCoreToolRunResult<TChildrenResponse>> => {
    const toolInfo = getToolInfo(call.function?.name);
    if (!toolInfo) {
      return {
        response: 'Call tool not found',
        assistantMessages: [],
        usages: [],
        interactive: undefined,
        stop: false
      };
    }

    if (toolInfo.type !== 'user') {
      /**
       * sandbox/readFile/datasetSearch 是 agent-loop provider 注入并拦截的内置工具。
       * 如果这里收到它们，说明内置工具被误放进 runtimeTools；返回稳定错误，避免绕过 provider 事件协议。
       */
      return {
        response: `${call.function.name} is an agent-loop system tool and cannot be executed as a runtime tool.`,
        assistantMessages: [],
        usages: [],
        interactive: undefined,
        stop: false
      };
    }

    const startParams = parseJsonArgs(call.function.arguments) ?? {};
    initAgentLoopCoreWorkflowToolNodes(runtimeNodes, [toolInfo.rawData.nodeId], startParams);
    initAgentLoopCoreWorkflowToolEdges(runtimeEdges, [toolInfo.rawData.nodeId]);

    const toolRunResponse = await runWorkflowTool({
      runtimeNodes,
      runtimeEdges
    });
    const { result, flowResponse } = toToolRunResult<TChildrenResponse>(toolRunResponse);

    /**
     * 这里只缓存真实工具/子流程的运行详情。
     * 最终 tool response 可能还会被 agentLoop 压缩，统一由 onToolRunEnd 落 nodeResponse。
     */
    cacheToolFlowResponse?.({
      callId: call.id,
      flowResponse
    });

    return result;
  };

  const runInteractiveTool = async ({
    childrenResponse,
    toolParams
  }: AgentLoopChildrenInteractiveParams<TChildrenResponse>) => {
    const entryNodeIds = (childrenResponse as { entryNodeIds?: string[] }).entryNodeIds ?? [];

    // 交互恢复沿用原 toolCallId，最终仍由统一 tool_run_end 落 SSE 和运行详情。
    initAgentLoopCoreWorkflowToolNodes(runtimeNodes, entryNodeIds);
    initAgentLoopCoreWorkflowToolEdges(runtimeEdges, entryNodeIds);

    const toolRunResponse = await runWorkflowTool({
      runtimeNodes,
      runtimeEdges,
      lastInteractive: childrenResponse
    });
    const { result, flowResponse } = toToolRunResult<TChildrenResponse>(toolRunResponse);

    cacheToolFlowResponse?.({
      callId: toolParams.toolCallId,
      flowResponse
    });

    return result;
  };

  return {
    runTool,
    runInteractiveTool
  };
};
