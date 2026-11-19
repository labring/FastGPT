import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
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
import type { AgentLoopInteractiveToolExecuteParams } from '../../../../../../ai/llm/agentLoop/interface';
import type { AgentLoopDatasetSearchExecutor } from '../../../../../../ai/llm/agentLoop/interface';
import { parseJsonArgs } from '../../../../../../ai/utils';
import type { AgentLoopCoreToolInfo, AgentLoopCoreToolRunResult } from '../../domain/toolProvider';
import {
  convertMcpToolContentToToolContent,
  extractAgentLoopCoreToolContent,
  maskToolImagePayload,
  unwrapPluginToolResponse
} from '../../domain/toolContent';
import { normalizeAgentLoopCoreDatasetSearchResult } from './systemToolHelpers';
import { cloneDeep } from 'lodash-es';
import { compileToolRuntime, mergeToolRuntimeParams } from '@fastgpt/global/core/app/tool/runtime';
import {
  rewriteNodeOutputByHistories,
  storeEdges2RuntimeEdges
} from '@fastgpt/global/core/workflow/runtime/utils';
import { WorkflowRunStateSnapshot } from '../../../../utils/containerRunState';
import { MODERATION_BLOCKED_REPLACE_TEXT } from '@fastgpt/global/core/plugin/moderation/constants';
import { markToolResultModerated } from '../../../../../../plugin/moderation/modelInput';

export type AgentLoopCoreWorkflowToolRunResponse<TChildrenResponse = unknown> = {
  flowResponses: NonNullable<DispatchFlowResponse['flatNodeResponses']>;
  workflowRuntimeSummary?: DispatchFlowResponse['workflowRuntimeSummary'];
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
    callId: string;
    runtimeNodes: RuntimeNodeItemType[];
    runtimeEdges: RuntimeEdgeItemType[];
    lastInteractive?: TChildrenResponse;
  }) => Promise<AgentLoopCoreWorkflowToolRunResponse<TChildrenResponse>>;
};

export type CreateAgentLoopCoreWorkflowSystemToolExecutorParams<TChildrenResponse = unknown> = {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  entryNodeIds: string[];
  runWorkflowTool: CreateAgentLoopCoreWorkflowToolRunnerParams<TChildrenResponse>['runWorkflowTool'];
};

export const updateAgentLoopCoreWorkflowToolInputValue = ({
  params,
  inputs
}: {
  params: Record<string, any>;
  inputs: FlowNodeInputItemType[];
}) => {
  const runtime = compileToolRuntime({
    toolId: 'workflow-tool',
    name: 'workflow-tool',
    inputs
  });
  const mergedParams = mergeToolRuntimeParams({
    agentGeneratedKeys: runtime.agentGeneratedKeys,
    fixedInputBindings: runtime.fixedInputBindings,
    aiParams: params
  });

  /**
   * Tool workflow 的输入 schema 来自原始节点；这里只允许覆盖用户最终选择为 Agent 生成的参数。
   * 使用 ?? 保留 0/false/'' 这类有效值，只有 null/undefined 才回退到节点默认值。
   */
  return inputs.map((input) => {
    const hasAgentGeneratedValue = Object.prototype.hasOwnProperty.call(mergedParams, input.key);

    return {
      ...input,
      value: hasAgentGeneratedValue ? (mergedParams[input.key] ?? input.value) : input.value
    };
  });
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
 * 初始化阶段直接在传入的 runtime edge/node 上标记入口状态。
 * 调用方需要根据自身的状态隔离要求决定是否先创建副本。
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

/** 将工作流工具结果转换为 Agent 响应，并保留结构化媒体内容和交互状态。 */
const toToolRunResult = <TChildrenResponse = unknown>(
  toolRunResponse: AgentLoopCoreWorkflowToolRunResponse<TChildrenResponse>
): AgentLoopCoreToolRunResult<TChildrenResponse> => {
  const hasModerationBlock = !!toolRunResponse.workflowRuntimeSummary?.hasModerationBlock;
  const errorMessage =
    !hasModerationBlock && !!toolRunResponse.workflowRuntimeSummary?.errorCount
      ? toolRunResponse.workflowRuntimeSummary?.errorText || 'Tool execution failed'
      : undefined;

  const { response, content } = (() => {
    const pluginResponse = unwrapPluginToolResponse(toolRunResponse.toolResponses);
    const rawResponse = pluginResponse?.result ?? toolRunResponse.toolResponses;
    const hasResponse = rawResponse !== undefined && rawResponse !== null && rawResponse !== '';
    // 没有结果的失败调用必须返回错误，而不是用空结果掩盖失败原因。
    const formatResponse = (value: unknown) =>
      hasResponse || !errorMessage ? formatAgentLoopCoreToolResponse(value) : errorMessage;

    if (pluginResponse) {
      // 插件执行时已按 outputSchema 投影，直接使用完整 content，不能再猜测业务字段。
      return {
        response: formatResponse(maskToolImagePayload(rawResponse)),
        content: pluginResponse.content.length > 0 ? pluginResponse.content : undefined
      };
    }

    // MCP 原生图片需先转为 image_url；HTTP 和 workflow 使用已有 content 契约。
    const mcpContent =
      rawResponse && typeof rawResponse === 'object' && 'content' in rawResponse
        ? rawResponse.content
        : undefined;
    const imageParts =
      convertMcpToolContentToToolContent(mcpContent) ??
      extractAgentLoopCoreToolContent(rawResponse);
    // 图片走结构化通道时，文本中的内联数据需遮蔽，避免重复发送。
    const response = formatResponse(
      maskToolImagePayload(rawResponse, { maskDataUrlParts: Boolean(imageParts) })
    );
    return {
      response,
      content: imageParts
        ? [
            { type: 'text' as const, text: response },
            ...imageParts.filter((part) => part.type === 'image_url')
          ]
        : undefined
    };
  })();

  const result: AgentLoopCoreToolRunResult<TChildrenResponse> = {
    // 工具失败时把错误原因返回给模型；'none' 会掩盖失败原因；内容审核命中时返回统一脱敏提示且不携带 errorMessage。
    response: hasModerationBlock ? MODERATION_BLOCKED_REPLACE_TEXT : response,
    ...(!hasModerationBlock && content ? { content } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    assistantMessages: hasModerationBlock
      ? []
      : getAssistantMessages(toolRunResponse.assistantResponses),
    ...(!hasModerationBlock && toolRunResponse.assistantResponses?.length
      ? { assistantResponses: toolRunResponse.assistantResponses }
      : {}),
    usages: toolRunResponse.flowUsages,
    interactive: toolRunResponse.workflowInteractiveResponse as TChildrenResponse | undefined,
    stop:
      !!toolRunResponse.workflowRuntimeSummary?.hasToolStop ||
      toolRunResponse.flowResponses.some((item) => item.toolStop)
  };
  if (hasModerationBlock || toolRunResponse.workflowRuntimeSummary?.hasToolResultModerated) {
    markToolResultModerated(result);
  }

  return result;
};

/** 合并每个知识库节点的独立 toolResponse，避免 workflow 只保留最后一个结果。 */
const formatDatasetSearchToolResponses = ({
  entryNodeIds,
  toolRunResponses
}: {
  entryNodeIds: string[];
  toolRunResponses: AgentLoopCoreWorkflowToolRunResponse[];
}) => {
  if (toolRunResponses.length === 1) {
    return formatAgentLoopCoreToolResponse(toolRunResponses[0].toolResponses);
  }

  return formatAgentLoopCoreToolResponse(
    toolRunResponses.map((toolRunResponse, index) => ({
      datasetNodeId: entryNodeIds[index],
      result: toolRunResponse.toolResponses
    }))
  );
};

/** 用首个知识库响应作为展示父节点，其余知识库保留为可展开的子运行详情。 */
const mergeDatasetSearchNodeResponses = (
  nodeResponses: ChatHistoryItemResType[]
): ChatHistoryItemResType | undefined => {
  const [firstResponse, ...remainingResponses] = nodeResponses;
  if (!firstResponse || remainingResponses.length === 0) return firstResponse;

  return {
    ...firstResponse,
    childrenResponses: [...(firstResponse.childrenResponses ?? []), ...remainingResponses]
  };
};

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
  entryNodeIds,
  runWorkflowTool
}: CreateAgentLoopCoreWorkflowSystemToolExecutorParams<TChildrenResponse>) => {
  const execute: AgentLoopDatasetSearchExecutor = async ({ call }) => {
    const params = parseJsonArgs<Record<string, unknown>>(call.function.arguments) ?? {};
    const query = Array.isArray(params.query)
      ? params.query
      : typeof params.query === 'string'
        ? [params.query]
        : [];

    const startTime = Date.now();
    const toolRunResponses = await Promise.all(
      entryNodeIds.map(async (entryNodeId) => {
        // 每个知识库使用隔离的 workflow 状态，避免入口标记和边状态互相污染。
        const isolatedRuntimeNodes = cloneDeep(runtimeNodes);
        const isolatedRuntimeEdges = cloneDeep(runtimeEdges);
        initAgentLoopCoreWorkflowToolNodes(isolatedRuntimeNodes, [entryNodeId], {
          ...params,
          [NodeInputKeyEnum.datasetSearchInput]: query,
          [NodeInputKeyEnum.userChatInput]: ''
        });
        const datasetNode = isolatedRuntimeNodes.find((node) => node.nodeId === entryNodeId);
        if (datasetNode) {
          // dataset_search 的系统参数由 agent-loop 直接生成，不受工具输入最终类型过滤影响。
          datasetNode.inputs = datasetNode.inputs.map((input) => {
            if (input.key === NodeInputKeyEnum.datasetSearchInput) {
              return { ...input, value: query };
            }
            if (input.key === NodeInputKeyEnum.userChatInput) {
              return { ...input, value: '' };
            }
            return input;
          });
        }
        initAgentLoopCoreWorkflowToolEdges(isolatedRuntimeEdges, [entryNodeId]);

        return runWorkflowTool({
          callId: call.id,
          runtimeNodes: isolatedRuntimeNodes,
          runtimeEdges: isolatedRuntimeEdges
        });
      })
    );
    const datasetNodeResponses = toolRunResponses
      .flatMap((item) => item.flowResponses)
      .filter((item) => entryNodeIds.includes(item.nodeId));
    const hasModerationBlock = toolRunResponses.some(
      (item) => item.workflowRuntimeSummary?.hasModerationBlock
    );
    const allModerated =
      toolRunResponses.length > 0 &&
      toolRunResponses.every((item) => item.workflowRuntimeSummary?.hasToolResultModerated);

    const normalizedDatasetResult = normalizeAgentLoopCoreDatasetSearchResult({
      callId: call.id,
      startTime,
      response: hasModerationBlock
        ? MODERATION_BLOCKED_REPLACE_TEXT
        : formatDatasetSearchToolResponses({
            entryNodeIds,
            toolRunResponses
          }),
      usages: toolRunResponses.flatMap((item) => item.flowUsages),
      nodeResponse: mergeDatasetSearchNodeResponses(datasetNodeResponses)
    });
    if (hasModerationBlock || allModerated) {
      markToolResultModerated(normalizedDatasetResult);
    }
    return normalizedDatasetResult;
  };

  return execute;
};

/**
 * 创建 workflow 子工具执行器。
 *
 * ToolCall 和未来的简化 Agent 都可以把“某个 runtime node 作为工具入口运行”的能力交给这里。
 * 节点外壳只负责提供实际 runWorkflow 函数和展示信息；子流程运行次数由该函数的适配器统计。
 *
 * 普通调用和交互恢复均隔离输入、入口和连线状态；本次改变的节点输出显式回写父图。
 * 变量作用域及提交策略由实际 runWorkflowTool 适配器管理，不随 runtime graph 在此处复制。
 */
export const createAgentLoopCoreWorkflowToolRunner = <TChildrenResponse = unknown>({
  runtimeNodes,
  runtimeEdges,
  getToolInfo,
  runWorkflowTool
}: CreateAgentLoopCoreWorkflowToolRunnerParams<TChildrenResponse>) => {
  /**
   * 在独立子图上执行，并提交本轮改变的输出值。Workflow Tool 没有容器专属的节点集合，
   * 工具自身及其他节点的输出都可能被父流程引用，因此保留所有现存节点的输出同步。
   * 仅同步相对调用开始发生变化的值，避免旧快照覆盖其他调用已更新的无关输出。
   */
  const runIsolatedWorkflowTool = async ({
    callId,
    entryNodeIds,
    startParams,
    lastInteractive
  }: {
    callId: string;
    entryNodeIds: string[];
    startParams?: Record<string, any>;
    lastInteractive?: TChildrenResponse;
  }) => {
    const isolatedRuntimeNodes = cloneDeep(runtimeNodes);
    const isolatedRuntimeEdges = cloneDeep(runtimeEdges);
    const stateSnapshot = new WorkflowRunStateSnapshot({
      nodeOutputs: {
        sourceNodes: isolatedRuntimeNodes,
        targetNodes: runtimeNodes
      }
    });
    if (lastInteractive) {
      const interactive = lastInteractive as {
        nodeOutputs?: any[];
        memoryEdges?: RuntimeEdgeItemType[];
      };
      const restoredNodes = rewriteNodeOutputByHistories(isolatedRuntimeNodes, interactive as any);
      isolatedRuntimeNodes.splice(0, isolatedRuntimeNodes.length, ...restoredNodes);
      if (interactive.memoryEdges?.length) {
        const restoredEdges = storeEdges2RuntimeEdges(isolatedRuntimeEdges, interactive as any);
        isolatedRuntimeEdges.splice(0, isolatedRuntimeEdges.length, ...cloneDeep(restoredEdges));
      }
    }
    initAgentLoopCoreWorkflowToolNodes(isolatedRuntimeNodes, entryNodeIds, startParams);
    initAgentLoopCoreWorkflowToolEdges(isolatedRuntimeEdges, entryNodeIds);

    try {
      return await runWorkflowTool({
        callId,
        runtimeNodes: isolatedRuntimeNodes,
        runtimeEdges: isolatedRuntimeEdges,
        ...(lastInteractive !== undefined ? { lastInteractive } : {})
      });
    } finally {
      // 暂停或后续执行失败也保留已完成的节点输出；变量提交由适配器按成功策略独立处理。
      await stateSnapshot.commit();
    }
  };

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
    return toToolRunResult<TChildrenResponse>(
      await runIsolatedWorkflowTool({
        callId: call.id,
        entryNodeIds: [toolInfo.rawData.nodeId],
        startParams
      })
    );
  };

  const runInteractiveTool = async ({
    call,
    childrenResponse,
    toolCallId
  }: AgentLoopInteractiveToolExecuteParams<TChildrenResponse>) => {
    const entryNodeIds = (childrenResponse as { entryNodeIds?: string[] }).entryNodeIds ?? [];
    const startParams = parseJsonArgs(call?.function?.arguments) ?? {};

    // 交互恢复沿用原 toolCallId，最终仍由统一 tool_run_end 推送 SSE。
    return toToolRunResult<TChildrenResponse>(
      await runIsolatedWorkflowTool({
        callId: toolCallId,
        entryNodeIds,
        startParams,
        lastInteractive: childrenResponse
      })
    );
  };

  return {
    runTool,
    runInteractiveTool
  };
};
