import { getErrText } from '@fastgpt/global/common/error/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { hasContextCheckpoint } from '@fastgpt/global/core/chat/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { DispatchFlowResponse } from '../type';
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

    // Forbid show detail
    const notDetailEvent: Record<string, 1> = {
      [SseResponseEventEnum.answer]: 1,
      [SseResponseEventEnum.fastAnswer]: 1
    };
    if (!detail && !notDetailEvent[event]) return;

    // Forbid show running status
    const statusEvent: Record<string, 1> = {
      [SseResponseEventEnum.flowNodeStatus]: 1,
      [SseResponseEventEnum.toolCall]: 1,
      [SseResponseEventEnum.toolParams]: 1,
      [SseResponseEventEnum.toolResponse]: 1
    };
    if (!showNodeStatus && statusEvent[event]) return;

    writeStreamChunk({
      event: detail ? event : undefined,
      data: JSON.stringify({
        ...data,
        ...(id && detail && { responseValueId: id })
      })
    });
  };
  return fn;
};
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

/*
  Filter orphan edges from workflow.
  Orphan edges are edges that have a source or target that is not in the nodes array.
  This is used to prevent errors when the workflow is edited and the nodes are not updated.
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

    // Log orphan edges for debugging
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
  // Select reference history
  if (Array.isArray(history)) return history;

  // history is number
  const systemHistoryIndex = histories.findIndex((item) => item.obj !== ChatRoleEnum.System);
  const systemHistories = histories.slice(0, systemHistoryIndex);
  const chatHistories = histories.slice(systemHistoryIndex);

  // Checkpoint is a compact replacement for previous chat history, so it must survive
  // the normal recent-N window. chats2GPTMessages will adapt its content into messages.
  const checkpointIndex = getLatestContextCheckpointIndex(chatHistories);
  if (checkpointIndex >= 0) {
    return [...systemHistories, ...chatHistories.slice(checkpointIndex)];
  }

  const filterHistories = chatHistories.slice(-(history * 2));

  return [...systemHistories, ...filterHistories];
};

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
 * ToolSet node will be replaced by Children Tool Nodes.
 * @param nodes
 * @param edges
 * @returns
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
  /* Toolset 展开 */
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
    // 批量获取 toolset
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
    // 批量获取 toolset
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

export const getNodeErrResponse = ({
  error,
  customErr,
  responseData,
  runTimes,
  system_memories
}: {
  error: any;
  customErr?: Record<string, any>;
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
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      errorText,
      ...(typeof responseData === 'object' ? responseData : {})
    },
    [DispatchNodeResponseKeyEnum.toolResponses]: {
      error: errorText,
      ...(typeof customErr === 'object' ? customErr : {})
    }
  };
};

export const safePoints = (val: number | undefined | null): number =>
  Number.isFinite(val) ? (val as number) : 0;

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

// Sets nestedStart as entry and injects current item + 1-based index.
// Shared by loop and parallelRun dispatchers.
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
