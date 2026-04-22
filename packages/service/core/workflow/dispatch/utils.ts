import path from 'path';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { DispatchFlowResponse } from './type';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VariableInputEnum
} from '@fastgpt/global/core/workflow/constants';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { encryptSecret } from '../../../common/secret/aes256gcm';
import { imageFileType } from '@fastgpt/global/common/file/constants';
import type { ChatDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import {
  type RuntimeNodeItemType,
  type SystemVariablesType
} from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { responseWrite } from '../../../common/response';
import { type NextApiResponse } from 'next';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { type SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import {
  getHTTPToolRuntimeNode,
  parseHttpToolConfig
} from '@fastgpt/global/core/app/tool/httpTool/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { MongoApp } from '../../../core/app/schema';
import { getMCPChildren } from '../../../core/app/mcp';
import { getSystemToolRunTimeNodeFromSystemToolset } from '../utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/tool/httpTool/type';
import type { WorkflowResponseType } from './type';
import { getLogger, LogCategories } from '../../../common/logger';
import { anyValueDecrypt } from '../../../common/secret/utils';
import { valueTypeFormat } from '@fastgpt/global/core/workflow/runtime/utils';
import { presignVariablesFileUrls } from '../../chat/utils';
import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import { parsetMcpToolConfig } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { getMcpToolsets } from '../../app/tool/mcpTool/entity';
import { getHttpToolsets } from '../../app/tool/httpTool/entity';
import { getHTTPToolList } from '../../app/http';

/* get system variable */
export const getSystemVariables = async ({
  timezone,
  runningAppInfo,
  chatId,
  responseChatItemId,
  histories = [],
  uid,
  chatConfig,
  variables
}: {
  runningAppInfo: ChatDispatchProps['runningAppInfo'];
  chatId: ChatDispatchProps['chatId'];
  responseChatItemId: ChatDispatchProps['responseChatItemId'];
  histories: ChatDispatchProps['histories'];
  uid: ChatDispatchProps['uid'];
  chatConfig: ChatDispatchProps['chatConfig'];
  variables: ChatDispatchProps['variables'];
  timezone: string;
}): Promise<SystemVariablesType> => {
  // Get global variables(Label -> key; Key -> key)
  const variablesConfig = chatConfig?.variables || [];

  const variablesMap: Record<string, any> = {};
  for await (const item of variablesConfig) {
    // For internal variables, ignore external input and use default value
    if (item.type === VariableInputEnum.password) {
      const val = variables[item.label] || variables[item.key] || item.defaultValue;
      const actualValue = anyValueDecrypt(val);
      variablesMap[item.key] = valueTypeFormat(actualValue, item.valueType);
    }
    //  文件类型全局变量，签发成 string[] 格式
    else if (item.type === VariableInputEnum.file) {
      const vars = await presignVariablesFileUrls({
        variables,
        variableConfig: [item]
      });

      variablesMap[item.key] = vars?.[item.key]?.map((item: any) => item.url);
    }
    // API
    else if (variables[item.label] !== undefined) {
      variablesMap[item.key] = valueTypeFormat(variables[item.label], item.valueType);
    }
    // Web
    else if (variables[item.key] !== undefined) {
      variablesMap[item.key] = valueTypeFormat(variables[item.key], item.valueType);
    } else {
      variablesMap[item.key] = valueTypeFormat(item.defaultValue, item.valueType);
    }
  }

  return {
    ...variablesMap,
    // System var:
    userId: uid,
    appId: String(runningAppInfo.id),
    chatId,
    responseChatItemId,
    histories,
    cTime: getSystemTime(timezone)
  };
};

export const getWorkflowResponseWrite = ({
  res,
  detail,
  streamResponse,
  id = getNanoid(24),
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

  const fn: WorkflowResponseType = ({ id, stepId, event, data }) => {
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
        ...(stepId && detail && { stepId }),
        ...(id && detail && { responseValueId: id })
      })
    });
  };
  return fn;
};
export const getWorkflowChildResponseWrite = ({
  id,
  stepId,
  fn
}: {
  id: string;
  stepId: string;
  fn?: WorkflowResponseType;
}): WorkflowResponseType | undefined => {
  if (!fn) return;
  return (e: Parameters<WorkflowResponseType>[0]) => {
    return fn({ ...e, id, stepId });
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
  if (!history) return [];
  // Select reference history
  if (Array.isArray(history)) return history;

  // history is number
  const systemHistoryIndex = histories.findIndex((item) => item.obj !== ChatRoleEnum.System);
  const systemHistories = histories.slice(0, systemHistoryIndex);
  const chatHistories = histories.slice(systemHistoryIndex);
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

/* remove system variable */
export const runtimeSystemVar2StoreType = ({
  variables,
  removeObj = {},
  userVariablesConfigs = []
}: {
  variables: Record<string, any>;
  removeObj?: Record<string, string>;
  userVariablesConfigs?: VariableItemType[];
}) => {
  const copyVariables = { ...variables };

  // Delete system variables
  delete copyVariables.userId;
  delete copyVariables.appId;
  delete copyVariables.chatId;
  delete copyVariables.responseChatItemId;
  delete copyVariables.histories;
  delete copyVariables.cTime;

  // Delete special variables
  Object.keys(removeObj).forEach((key) => {
    delete copyVariables[key];
  });

  // Encrypt password variables
  userVariablesConfigs.forEach((item) => {
    const val = copyVariables[item.key];
    if (item.type === VariableInputEnum.password) {
      if (typeof val === 'string') {
        copyVariables[item.key] = {
          value: '',
          secret: encryptSecret(val)
        };
      }
    }
    // Handle file variables
    else if (item.type === VariableInputEnum.file) {
      const currentValue = copyVariables[item.key];

      copyVariables[item.key] = currentValue
        .map((url: string) => {
          try {
            const urlObj = new URL(url);
            // Extract key: remove bucket prefix (e.g., "/fastgpt-private/")
            const key = decodeURIComponent(urlObj.pathname.replace(/^\/[^/]+\//, ''));
            const filename = path.basename(key) || 'file';
            const extname = path.extname(key).toLowerCase(); // includes the dot, e.g., ".jpg"

            // Check if it's an image type
            const isImage = extname && imageFileType.includes(extname);

            return {
              id: path.basename(key, path.extname(key)), // filename without extension
              key,
              name: filename
            };
          } catch {
            return null;
          }
        })
        .filter((file: any) => file !== null);
    }
  });

  return copyVariables;
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
      .map((node) => parsetMcpToolConfig(node.toolConfig?.mcpTool!))
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
      .map((node) => parseHttpToolConfig(node.toolConfig?.httpTool!))
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
  newVariables,
  system_memories
}: {
  error: any;
  customErr?: Record<string, any>;
  [DispatchNodeResponseKeyEnum.nodeResponse]?: Record<string, any>;
  [DispatchNodeResponseKeyEnum.runTimes]?: number;
  [DispatchNodeResponseKeyEnum.newVariables]?: Record<string, any>;
  [DispatchNodeResponseKeyEnum.memories]?: Record<string, any>;
}) => {
  const errorText = getErrText(error);

  return {
    [DispatchNodeResponseKeyEnum.runTimes]: runTimes,
    [DispatchNodeResponseKeyEnum.newVariables]: newVariables,
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

/**
 * Coerce a points value to a finite number, defaulting to 0 for
 * NaN / Infinity / null / undefined.
 */
export const safePoints = (val: number | undefined | null): number =>
  Number.isFinite(val) ? (val as number) : 0;

/**
 * Aggregate sub-workflow usage points for one iteration and push to the parent
 * dispatcher's usage accumulator. Returns the computed value so callers can
 * keep a running total. Shared by loop / loopRun dispatchers (parallelRun
 * inlines its own accumulator to fold retry attempts together).
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
 * Append customFeedbacks from a sub-workflow response into the provided
 * accumulator. Returns the same array for convenience.
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
 * Mutates nodes in-place: sets the nestedStart node as entry and injects the
 * current item / 1-based index into its inputs.
 *
 * Shared by loop and parallelRun dispatchers.
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
