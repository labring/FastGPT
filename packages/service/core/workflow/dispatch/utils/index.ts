import { getErrText } from '@fastgpt/global/common/error/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatHistoryItemResType, ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { hasContextCheckpoint } from '@fastgpt/global/core/chat/utils';
import { getChildrenResponses } from '@fastgpt/global/core/chat/utils/mergeNode';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { DispatchFlowResponse, RuntimeNodeResponseSummary } from '../type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  type RuntimeNodeItemType,
  type SystemVariablesType
} from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { responseWrite } from '../../../../common/response';
import { type NextApiResponse } from 'next';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { type SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import {
  getHTTPToolRuntimeNode,
  parseHttpToolConfig
} from '@fastgpt/global/core/app/tool/httpTool/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { MongoApp } from '../../../app/schema';
import { getMCPChildren } from '../../../app/mcp';
import { getSystemToolRunTimeNodeFromSystemToolset } from '../../utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/tool/httpTool/type';
import type { WorkflowResponseType } from '../type';
import { getLogger, LogCategories } from '../../../../common/logger';
import { parsetMcpToolConfig } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { getMcpToolsets } from '../../../app/tool/mcpTool/entity';
import { getHttpToolsets } from '../../../app/tool/httpTool/entity';
import { getHTTPToolList } from '../../../app/http';

/**
 * 创建 runtime nodeResponse 的轻量汇总对象。
 *
 * 该 summary 用于在 dispatch 过程中传递父流程需要的运行信号，避免把完整
 * nodeResponses 长时间保留在内存里。
 */
export const createRuntimeNodeResponseSummary = (): RuntimeNodeResponseSummary => ({
  responseIds: [],
  finishedNodeIds: [],
  hasError: false,
  hasLoopRunBreak: false,
  hasToolStop: false,
  hasNestedEnd: false,
  runningTime: 0
});

/**
 * 增量更新父 workflow 运行控制需要的临时字段。
 *
 * 完整 nodeResponse 会由 writer 及时落库并释放；父节点只需要这些信号来判断
 * nestedEnd 输出、错误、loop break、tool stop、完成节点、耗时和 child 统计。
 * 调用方每处理完一批 nodeResponse，就把当前 summary 和本批响应传进来，返回新的
 * summary，避免重新保存或扫描完整 nodeResponse 列表。
 */
export const summarizeRuntimeNodeResponses = (
  currentSummary: RuntimeNodeResponseSummary | undefined,
  nodeResponses: ChatHistoryItemResType[] = []
): RuntimeNodeResponseSummary => {
  const initialSummary = currentSummary
    ? {
        ...currentSummary,
        responseIds: [...currentSummary.responseIds],
        finishedNodeIds: [...currentSummary.finishedNodeIds]
      }
    : createRuntimeNodeResponseSummary();

  const responseIdsWithConcreteParent = new Set(
    nodeResponses
      .map((response) => response.parentId)
      .filter((parentId): parentId is string => !!parentId)
  );
  // 已进入 currentSummary 的 response id 不能再次计入统计，避免重复事件或分批更新导致
  // runningTime/points/responseCount 被累加两次。
  const countedIds = new Set(initialSummary.responseIds);

  const addResponseToSummary = (
    summary: RuntimeNodeResponseSummary,
    response: ChatHistoryItemResType
  ) => {
    if (response.id && countedIds.has(response.id)) {
      return summary;
    }
    if (response.id) {
      countedIds.add(response.id);
    }

    if (response.id) {
      summary.responseIds.push(response.id);
    }
    if (response.nodeId) {
      summary.finishedNodeIds.push(response.nodeId);
    }
    if (response.error || response.errorText) {
      summary.hasError = true;
      summary.errorText = getErrText(response.error || response.errorText);
    }
    if (response.moduleType === FlowNodeTypeEnum.loopRunBreak) {
      summary.hasLoopRunBreak = true;
    }
    if (response.toolStop) {
      summary.hasToolStop = true;
    }
    if (response.moduleType === FlowNodeTypeEnum.nestedEnd) {
      summary.hasNestedEnd = true;
      summary.nestedEndOutput = response.loopOutputValue;
    }
    if (response.moduleType === FlowNodeTypeEnum.pluginOutput && response.pluginOutput) {
      summary.pluginOutput = response.pluginOutput;
    }

    summary.runningTime += typeof response.runningTime === 'number' ? response.runningTime : 0;

    const children = getChildrenResponses(response);
    const hasConcreteChild =
      children.length > 0 || (response.id ? responseIdsWithConcreteParent.has(response.id) : false);
    // 已有实际 child response 时，父 response 上的 child 汇总只作为兼容字段，不能再重复累加。
    const totalPoints = response.totalPoints || 0;
    const childTotalPoints = hasConcreteChild ? 0 : response.childTotalPoints || 0;
    const childResponseCount = hasConcreteChild ? 0 : response.childResponseCount || 0;
    summary.totalPoints = (summary.totalPoints || 0) + totalPoints;
    summary.childTotalPoints = (summary.childTotalPoints || 0) + totalPoints + childTotalPoints;
    summary.childResponseCount = (summary.childResponseCount || 0) + 1 + childResponseCount;

    children.forEach((child) => {
      addResponseToSummary(summary, child);
    });

    return summary;
  };

  return nodeResponses.reduce<RuntimeNodeResponseSummary>(
    (summary, response) => addResponseToSummary(summary, response),
    initialSummary
  );
};

/**
 * 合并多个子流程或并行分支返回的轻量 nodeResponse summary。
 *
 * 这里不重新扫描完整 nodeResponses，只把各分支已汇总出的控制信号、计费点数和
 * response 计数累加到同一个 summary 中。
 */
export const mergeRuntimeNodeResponseSummary = (
  ...summaries: (RuntimeNodeResponseSummary | undefined)[]
): RuntimeNodeResponseSummary =>
  summaries.reduce<RuntimeNodeResponseSummary>((merged, summary) => {
    if (!summary) return merged;

    merged.responseIds.push(...summary.responseIds);
    merged.finishedNodeIds.push(...summary.finishedNodeIds);
    merged.hasError ||= summary.hasError;
    merged.errorText = summary.errorText || merged.errorText;
    merged.hasLoopRunBreak ||= summary.hasLoopRunBreak;
    merged.hasToolStop ||= summary.hasToolStop;
    merged.hasNestedEnd ||= summary.hasNestedEnd;
    if (summary.nestedEndOutput !== undefined) {
      merged.nestedEndOutput = summary.nestedEndOutput;
    }
    if (summary.pluginOutput !== undefined) {
      merged.pluginOutput = summary.pluginOutput;
    }
    merged.runningTime += summary.runningTime;
    merged.totalPoints = (merged.totalPoints || 0) + (summary.totalPoints || 0);
    merged.childTotalPoints = (merged.childTotalPoints || 0) + (summary.childTotalPoints || 0);
    merged.childResponseCount =
      (merged.childResponseCount || 0) + (summary.childResponseCount || 0);

    return merged;
  }, createRuntimeNodeResponseSummary());

/**
 * 从 dispatch response 中取得 nodeResponse summary。
 *
 * 新流程会优先返回 runtimeNodeResponseSummary；旧逻辑或兼容路径只携带
 * nodeResponses 时，会现场扫描一次并生成等价 summary。
 */
export const getRuntimeNodeResponseSummary = (response: {
  runtimeNodeResponseSummary?: RuntimeNodeResponseSummary;
  nodeResponses?: ChatHistoryItemResType[];
}): RuntimeNodeResponseSummary => {
  if (!response) return createRuntimeNodeResponseSummary();

  if (
    response.runtimeNodeResponseSummary &&
    (response.runtimeNodeResponseSummary.responseIds.length > 0 ||
      response.runtimeNodeResponseSummary.finishedNodeIds.length > 0 ||
      response.runtimeNodeResponseSummary.hasError ||
      response.runtimeNodeResponseSummary.hasLoopRunBreak ||
      response.runtimeNodeResponseSummary.hasToolStop ||
      response.runtimeNodeResponseSummary.hasNestedEnd ||
      response.runtimeNodeResponseSummary.pluginOutput !== undefined ||
      response.runtimeNodeResponseSummary.totalPoints !== undefined ||
      response.runtimeNodeResponseSummary.childTotalPoints !== undefined ||
      response.runtimeNodeResponseSummary.childResponseCount !== undefined)
  ) {
    return response.runtimeNodeResponseSummary;
  }

  return summarizeRuntimeNodeResponses(undefined, response.nodeResponses);
};

/**
 * 构造 workflow SSE 写入函数。
 *
 * 支持按 detail 配置过滤事件、按 showNodeStatus 隐藏节点运行状态，并在恢复续传场景下
 * 同步记录原始 SSE chunk。传入字符串 data 时会按原始文本直接写出。
 */
export const getWorkflowResponseWrite = ({
  res,
  detail,
  streamResponse,
  showNodeStatus = true,
  streamResumeMirror
}: {
  res?: NextApiResponse;
  detail: boolean;
  streamResponse: boolean;
  id?: string;
  showNodeStatus?: boolean;
  streamResumeMirror?: {
    enqueueRaw?: (chunk: string) => Promise<void> | void;
  };
}) => {
  const writeStreamChunk = ({ event, data }: { event?: string; data: string }) => {
    if (!streamResponse) return;

    const raw = `${event ? `event: ${event}\n` : ''}data: ${data}\n\n`;

    void streamResumeMirror?.enqueueRaw?.(raw);

    if (!res || res.closed || res.writableEnded || res.destroyed) return;

    responseWrite({
      res,
      event,
      data
    });
  };

  const fn: WorkflowResponseType = ({ id, event, data }) => {
    if (typeof data === 'string') {
      writeStreamChunk({ event, data });
      return;
    }

    if (!streamResponse) return;
    if (!event) return;

    // detail=false 时只保留最终答案类事件，隐藏节点、工具和中间状态细节。
    const notDetailEvent: Record<string, 1> = {
      [SseResponseEventEnum.chatTitle]: 1,
      [SseResponseEventEnum.answer]: 1,
      [SseResponseEventEnum.fastAnswer]: 1
    };
    if (!detail && !notDetailEvent[event]) return;

    // 调试或对外 API 可以关闭节点状态流，避免暴露工具参数和运行过程。
    const statusEvent: Record<string, 1> = {
      [SseResponseEventEnum.flowNodeStatus]: 1,
      [SseResponseEventEnum.toolCall]: 1,
      [SseResponseEventEnum.toolParams]: 1,
      [SseResponseEventEnum.toolResponse]: 1
    };
    if (!showNodeStatus && statusEvent[event]) return;

    writeStreamChunk({
      event: detail || event === SseResponseEventEnum.chatTitle ? event : undefined,
      data: JSON.stringify({
        ...data,
        ...(id && detail && { responseValueId: id })
      })
    });
  };
  return fn;
};

/**
 * 为子 workflow 生成带默认 response id 的写入函数。
 *
 * 子流程事件如果没有显式 id，就继承父调用方传入的 id，保证前端能把流式事件归属到
 * 正确的 responseValue 上。
 */
export const getWorkflowChildResponseWrite = ({
  id,
  fn
}: {
  id: string;
  fn?: WorkflowResponseType;
}): WorkflowResponseType | undefined => {
  if (!fn) return;
  return (e: Parameters<WorkflowResponseType>[0]) => {
    return fn({
      ...e,
      id: e.id || id
    });
  };
};

/**
 * 过滤 runtime workflow 中端点节点不存在的孤儿边。
 *
 * 工作流编辑、模板迁移或节点删除后可能留下 source/target 已不存在的 edge。dispatch 前
 * 过滤这些边可以避免后续按节点连线查找时访问到无效节点，同时记录日志方便定位脏数据。
 */
export const filterOrphanEdges = ({
  edges,
  nodes,
  workflowId
}: {
  edges: RuntimeEdgeItemType[];
  nodes: RuntimeNodeItemType[];
  workflowId: string;
}) => {
  const filterStartTime = Date.now();
  const validNodeIds = new Set(nodes.map((node) => node.nodeId));
  const originalEdgeCount = edges.length;
  const orphanEdges: RuntimeEdgeItemType[] = [];

  const filteredEdges = edges.filter((edge) => {
    const sourceExists = validNodeIds.has(edge.source);
    const targetExists = validNodeIds.has(edge.target);

    // 保留孤儿边数量用于日志排查，不在日志中展开完整 edge，避免输出过大。
    if (!sourceExists || !targetExists) {
      orphanEdges.push(edge);
    }

    return sourceExists && targetExists;
  });

  const filteredCount = originalEdgeCount - filteredEdges.length;
  if (filteredCount > 0) {
    getLogger(LogCategories.MODULE.WORKFLOW).info(
      `Filtered ${filteredCount} orphan edge(s) from workflow`,
      {
        workflowId,
        originalCount: originalEdgeCount,
        finalCount: filteredEdges.length
      }
    );

    if (orphanEdges.length > 0) {
      getLogger(LogCategories.MODULE.WORKFLOW).warn(`Orphan edges details: ${orphanEdges.length}`);
    }
  }

  const filterDuration = Date.now() - filterStartTime;
  if (filterDuration > 100) {
    getLogger(LogCategories.MODULE.WORKFLOW).warn('Orphan edge filtering took significant time');
  }

  return filteredEdges;
};

/**
 * 根据 selectedTools 连线找出某个工具选择节点实际选中的工具节点 id。
 */
export const filterToolNodeIdByEdges = ({
  nodeId,
  edges
}: {
  nodeId: string;
  edges: RuntimeEdgeItemType[];
}) => {
  return edges
    .filter(
      (edge) => edge.source === nodeId && edge.targetHandle === NodeOutputKeyEnum.selectedTools
    )
    .map((edge) => edge.target);
};

/**
 * 按节点配置裁剪对话历史。
 *
 * history 传数组时直接作为引用历史使用；传数字时表示保留最近 N 轮用户/AI 对话，同时
 * 总是保留系统消息。若存在上下文压缩 checkpoint，则从最新 checkpoint 开始保留，
 * 因为 checkpoint 已代表更早历史的压缩结果。
 */
export const getHistories = (
  history?: ChatItemMiniType[] | number,
  histories: ChatItemMiniType[] = []
) => {
  const getLatestContextCheckpointIndex = (histories: ChatItemMiniType[]) => {
    for (let index = histories.length - 1; index >= 0; index--) {
      if (hasContextCheckpoint(histories[index])) return index;
    }

    return -1;
  };

  if (!history) return [];
  // 数组配置表示上游已经指定了完整引用历史，不再按轮次裁剪。
  if (Array.isArray(history)) return history;

  // 数字配置按最近 N 轮裁剪，system 消息单独保留在最前面。
  const systemHistoryIndex = histories.findIndex((item) => item.obj !== ChatRoleEnum.System);
  const systemHistories = histories.slice(0, systemHistoryIndex);
  const chatHistories = histories.slice(systemHistoryIndex);

  // checkpoint 是早期聊天记录的压缩替代，不能被普通 recent-N 窗口截断。
  const checkpointIndex = getLatestContextCheckpointIndex(chatHistories);
  if (checkpointIndex >= 0) {
    return [...systemHistories, ...chatHistories.slice(checkpointIndex)];
  }

  const filterHistories = chatHistories.slice(-(history * 2));

  return [...systemHistories, ...filterHistories];
};

/**
 * 校验引用知识库结果是否可作为 quoteQA 继续传递。
 *
 * undefined 表示没有有效引用；空数组是合法值，表示本次明确没有召回结果。
 */
export const checkQuoteQAValue = (quoteQA?: SearchDataResponseItemType[]) => {
  if (!quoteQA) return undefined;
  if (quoteQA.length === 0) {
    return [];
  }
  if (quoteQA.some((item) => typeof item !== 'object' || !item.q)) {
    return undefined;
  }
  return quoteQA;
};

/**
 * 从完整 workflow variables 中筛出可跨节点传递的系统变量。
 *
 * 这里只保留 dispatch 约定的系统字段，避免把节点私有变量或临时执行态扩散到下游。
 */
export const filterSystemVariables = (variables: Record<string, any>): SystemVariablesType => {
  return {
    userId: variables.userId,
    appId: variables.appId,
    chatId: variables.chatId,
    responseChatItemId: variables.responseChatItemId,
    histories: variables.histories,
    cTime: variables.cTime
  };
};

/**
 * 将 HTTP 请求异常整理成可序列化、可展示的错误摘要。
 *
 * Axios 等请求库的原始错误通常包含循环引用和大量配置对象，这里只保留排查请求失败所需的
 * method、status、code 和响应数据。
 */
export const formatHttpError = (error: any) => {
  return {
    message: getErrText(error),
    data: error?.response?.data,
    name: error?.name,
    method: error?.config?.method,
    code: error?.code,
    status: error?.status
  };
};

/**
 * 重写 runtime workflow 中的工具相关节点配置。
 *
 * 该函数会原地修改 nodes 和 edges：
 * - 将 ToolSet 节点展开为具体 Tool 节点，并把原来指向 ToolSet 的边改接到子工具节点。
 * - 为 MCP/HTTP Tool 节点补充原始 jsonSchema 和描述，供模型 tool call 生成参数时使用。
 */
export const rewriteRuntimeWorkFlow = async ({
  teamId,
  nodes,
  edges,
  lang
}: {
  teamId: string;
  nodes: RuntimeNodeItemType[];
  edges: RuntimeEdgeItemType[];
  lang?: localeType;
}) => {
  /* ToolSet 展开 */
  // TODO: 待性能优化
  const parseToolset = async () => {
    const toolSetNodes = nodes.filter((node) => node.flowNodeType === FlowNodeTypeEnum.toolSet);
    if (toolSetNodes.length > 0) {
      const nodeIdsToRemove = new Set<string>();

      for (const toolSetNode of toolSetNodes) {
        nodeIdsToRemove.add(toolSetNode.nodeId);

        const systemToolId = toolSetNode.toolConfig?.systemToolSet?.toolId;
        const mcpToolsetVal = toolSetNode.toolConfig?.mcpToolSet ?? toolSetNode.inputs?.[0]?.value;
        const httpToolsetVal = toolSetNode.toolConfig?.httpToolSet;

        const incomingEdges = edges.filter((edge) => edge.target === toolSetNode.nodeId);
        // ToolSet 只是编辑态聚合节点，运行态需要把入口边复制到每个实际工具节点。
        const pushEdges = (nodeId: string) => {
          for (const inEdge of incomingEdges) {
            edges.push({
              source: inEdge.source,
              target: nodeId,
              sourceHandle: inEdge.sourceHandle,
              targetHandle: 'selectedTools',
              status: inEdge.status
            });
          }
        };

        // systemTool
        if (systemToolId) {
          const children = await getSystemToolRunTimeNodeFromSystemToolset({
            toolSetNode,
            lang
          });
          children.forEach((node) => {
            nodes.push(node);
            pushEdges(node.nodeId);
          });
        } else if (mcpToolsetVal) {
          const app = await MongoApp.findOne({ _id: toolSetNode.pluginId }).lean();
          if (!app) continue;
          const toolList = await getMCPChildren(app);

          // mcpToolsetVal.toolId: 旧版 MCP
          const toolSetId = mcpToolsetVal.toolId || toolSetNode.pluginId;
          toolList.forEach((tool, index) => {
            const newToolNode = getMCPToolRuntimeNode({
              nodeId: `${toolSetNode.nodeId}${index}`,
              toolSetId,
              toolsetName: toolSetNode.name,
              avatar: toolSetNode.avatar,
              tool
            });
            nodes.push(newToolNode);
            pushEdges(newToolNode.nodeId);
          });
        } else if (httpToolsetVal) {
          const app = await MongoApp.findOne({ _id: toolSetNode.pluginId }).lean();
          if (!app) continue;

          const toolList = await getHTTPToolList(app);

          toolList.forEach((tool: HttpToolConfigType, index: number) => {
            const newToolNode = getHTTPToolRuntimeNode({
              tool,
              nodeId: `${toolSetNode.nodeId}${index}`,
              avatar: toolSetNode.avatar,
              toolSetId: toolSetNode.pluginId!,
              toolsetName: toolSetNode.name
            });
            nodes.push(newToolNode);
            pushEdges(newToolNode.nodeId);
          });
        }
      }

      // 倒序删除 ToolSet 节点和指向它的边，避免 splice 影响后续索引。
      for (let i = nodes.length - 1; i >= 0; i--) {
        if (nodeIdsToRemove.has(nodes[i].nodeId)) {
          nodes.splice(i, 1);
        }
      }

      for (let i = edges.length - 1; i >= 0; i--) {
        if (nodeIdsToRemove.has(edges[i].target)) {
          edges.splice(i, 1);
        }
      }
    }
  };

  /* MCP tool 获取原始 schema 加入到 jsonschema 字段里 */
  const parseMcpTool = async () => {
    const mcpToolNodes = nodes.filter(
      (node) => node.flowNodeType === FlowNodeTypeEnum.tool && node.toolConfig?.mcpTool
    );
    const parseMcpToolConfigs = mcpToolNodes
      .map((node) => {
        const mcpTool = node.toolConfig?.mcpTool;
        return mcpTool ? parsetMcpToolConfig(mcpTool) : undefined;
      })
      .filter(Boolean) as { toolsetId: string; toolName: string }[];
    // 批量获取 toolset，避免每个工具节点都单独查询一次数据库。
    const toolsets = await getMcpToolsets({
      teamId,
      ids: parseMcpToolConfigs.map((config) => config.toolsetId),
      field: {
        _id: true,
        modules: true
      }
    });
    const toolsetMap = new Map<string, (typeof toolsets)[number]>();
    toolsets.forEach((toolset) => {
      toolsetMap.set(String(toolset._id), toolset);
    });
    mcpToolNodes.forEach((node) => {
      const mcpTool = node.toolConfig?.mcpTool;
      if (!mcpTool) return;
      const parseResult = parsetMcpToolConfig(mcpTool);
      if (!parseResult) return;
      const toolset = toolsetMap.get(parseResult.toolsetId);
      const toolList = toolset?.modules?.[0].toolConfig?.mcpToolSet?.toolList;
      if (!toolList) return;
      const toolRaw = toolList.find((tool) => tool.name === parseResult.toolName);
      if (!toolRaw) return;
      node.jsonSchema = toolRaw.inputSchema;
      node.intro = toolRaw.description;
    });
  };

  /* Http tool 获取原始 schema 加入到 jsonschema 字段里 */
  const parseHttpTool = async () => {
    const httpToolNodes = nodes.filter(
      (node) => node.flowNodeType === FlowNodeTypeEnum.tool && node.toolConfig?.httpTool
    );
    const parseHttpToolConfigs = httpToolNodes
      .map((node) => {
        const httpTool = node.toolConfig?.httpTool;
        return httpTool ? parseHttpToolConfig(httpTool) : undefined;
      })
      .filter(Boolean) as { toolsetId: string; toolName: string }[];
    // 批量获取 toolset，避免每个工具节点都单独查询一次数据库。
    const toolsets = await getHttpToolsets({
      teamId,
      ids: parseHttpToolConfigs.map((config) => config.toolsetId),
      field: {
        _id: true,
        modules: true
      }
    });
    const toolsetMap = new Map<string, (typeof toolsets)[number]>();
    toolsets.forEach((toolset) => {
      toolsetMap.set(String(toolset._id), toolset);
    });
    httpToolNodes.forEach((node) => {
      const httpTool = node.toolConfig?.httpTool;
      if (!httpTool) return;
      const parseResult = parseHttpToolConfig(httpTool);
      if (!parseResult) return;
      const toolset = toolsetMap.get(parseResult.toolsetId);
      const toolList = toolset?.modules?.[0].toolConfig?.httpToolSet?.toolList;
      if (!toolList) return;
      const toolRaw = toolList.find((tool) => tool.name === parseResult.toolName);
      if (!toolRaw) return;
      node.jsonSchema = toolRaw.requestSchema;
      node.intro = toolRaw.description;
    });
  };

  await Promise.all([parseToolset(), parseMcpTool(), parseHttpTool()]);
};

/**
 * 生成节点执行失败时的标准返回结构。
 *
 * 同一份错误会被写入节点输出、nodeResponse 和 toolResponse，兼容普通节点执行、
 * 前端节点详情展示以及 tool call 调用方读取错误的不同路径。
 */
export const getNodeErrResponse = <TError extends Record<string, any> = Record<string, never>>({
  error,
  customErr,
  responseData,
  runTimes,
  system_memories
}: {
  error: any;
  customErr?: TError;
  [DispatchNodeResponseKeyEnum.nodeResponse]?: Record<string, any>;
  [DispatchNodeResponseKeyEnum.runTimes]?: number;
  [DispatchNodeResponseKeyEnum.memories]?: Record<string, any>;
}) => {
  const errorText = getErrText(error);

  return {
    [DispatchNodeResponseKeyEnum.runTimes]: runTimes,
    [DispatchNodeResponseKeyEnum.memories]: system_memories,
    error: {
      [NodeOutputKeyEnum.errorText]: errorText,
      ...(typeof customErr === 'object' ? customErr : {})
    } as {
      [NodeOutputKeyEnum.errorText]: string;
    } & TError,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      errorText,
      ...(typeof responseData === 'object' ? responseData : {})
    },
    [DispatchNodeResponseKeyEnum.toolResponse]: {
      error: errorText,
      ...(typeof customErr === 'object' ? customErr : {})
    }
  };
};

/**
 * 将计费点数归一化为有限数字。
 *
 * 子流程汇总可能遇到 undefined、null 或异常 NaN，这里统一按 0 处理，避免计费累加结果
 * 被非有限值污染。
 */
export const safePoints = (val: number | undefined | null): number =>
  Number.isFinite(val) ? (val as number) : 0;

/**
 * 汇总一次子 workflow 的 usage，并追加到父节点 usage 列表。
 *
 * moduleName 会带上迭代序号，便于 loop/parallelRun 这类重复执行节点在账单详情中区分
 * 每次子流程执行产生的点数。
 */
export const pushSubWorkflowUsage = ({
  usagePush,
  response,
  name,
  iteration
}: {
  usagePush: (usages: ChatNodeUsageType[]) => void;
  response: DispatchFlowResponse;
  name: string;
  iteration: number;
}): number => {
  const itemUsagePoint = response.flowUsages.reduce(
    (acc, usage) => acc + safePoints(usage.totalPoints),
    0
  );
  usagePush([{ totalPoints: itemUsagePoint, moduleName: `${name}-${iteration}` }]);
  return itemUsagePoint;
};

/**
 * 收集子 workflow 返回的自定义反馈，并追加到调用方维护的反馈数组。
 */
export const collectResponseFeedbacks = (
  response: DispatchFlowResponse,
  target: string[]
): string[] => {
  const feedbacks = response[DispatchNodeResponseKeyEnum.customFeedbacks];
  if (feedbacks && feedbacks.length > 0) {
    target.push(...feedbacks);
  }
  return target;
};

/**
 * 将子流程中的 nestedStart 标记为入口，并注入当前迭代 item 与 1-based index。
 *
 * loop 与 parallelRun 都会复用该逻辑，确保嵌套子流程拿到一致的输入变量约定。
 */
export const injectNestedStartInputs = ({
  nodes,
  childrenNodeIdList,
  item,
  index
}: {
  nodes: RuntimeNodeItemType[];
  childrenNodeIdList: string[];
  item: any;
  index: number;
}): void => {
  nodes.forEach((node) => {
    if (!childrenNodeIdList.includes(node.nodeId)) return;
    if (node.flowNodeType === FlowNodeTypeEnum.nestedStart) {
      node.isEntry = true;
      node.inputs.forEach((input) => {
        if (input.key === NodeInputKeyEnum.nestedStartInput) {
          input.value = item;
        } else if (input.key === NodeInputKeyEnum.nestedStartIndex) {
          input.value = index + 1; // 1-based
        }
      });
    }
  });
};
