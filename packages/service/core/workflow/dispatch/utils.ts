import { getErrText } from '@fastgpt/global/common/error/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type.d';
import { NodeOutputKeyEnum, VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { encryptSecret } from '../../../common/secret/aes256gcm';
import {
  type RuntimeEdgeItemType,
  type RuntimeNodeItemType,
  type SystemVariablesType
} from '@fastgpt/global/core/workflow/runtime/type';
import { responseWrite } from '../../../common/response';
import { type NextApiResponse } from 'next';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { type SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { getHTTPToolRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { MongoApp } from '../../../core/app/schema';
import { getMCPChildren } from '../../../core/app/mcp';
import { getSystemToolRunTimeNodeFromSystemToolset } from '../utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/type';

export const getWorkflowResponseWrite = ({
  res,
  detail,
  streamResponse,
  id = getNanoid(24),
  showNodeStatus = true
}: {
  res?: NextApiResponse;
  detail: boolean;
  streamResponse: boolean;
  id?: string;
  showNodeStatus?: boolean;
}) => {
  return ({
    write,
    event,
    data
  }: {
    write?: (text: string) => void;
    event: SseResponseEventEnum;
    data: Record<string, any>;
  }) => {
    const useStreamResponse = streamResponse;

    if (!res || res.closed || !useStreamResponse) return;

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

    responseWrite({
      res,
      write,
      event: detail ? event : undefined,
      data: JSON.stringify(data)
    });
  };
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

export const getHistories = (history?: ChatItemType[] | number, histories: ChatItemType[] = []) => {
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
  cloneVariables,
  removeObj = {},
  userVariablesConfigs = []
}: {
  variables: Record<string, any>;
  cloneVariables: Record<string, any>;
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
    // Remove URL from file variables
    else if (item.type === VariableInputEnum.file) {
      copyVariables[item.key] = cloneVariables[item.key];
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
  nodes,
  edges,
  lang
}: {
  nodes: RuntimeNodeItemType[];
  edges: RuntimeEdgeItemType[];
  lang?: localeType;
}) => {
  const toolSetNodes = nodes.filter((node) => node.flowNodeType === FlowNodeTypeEnum.toolSet);

  if (toolSetNodes.length === 0) {
    return;
  }

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

      const parentId = mcpToolsetVal.toolId ?? toolSetNode.pluginId;
      toolList.forEach((tool, index) => {
        const newToolNode = getMCPToolRuntimeNode({
          avatar: toolSetNode.avatar,
          tool,
          // New ?? Old
          parentId
        });
        newToolNode.nodeId = `${parentId}${index}`; // ID 不能随机，否则下次生成时候就和之前的记录对不上

        nodes.push({
          ...newToolNode,
          name: `${toolSetNode.name}/${tool.name}`
        });
        pushEdges(newToolNode.nodeId);
      });
    } else if (httpToolsetVal) {
      const parentId = toolSetNode.pluginId || '';
      httpToolsetVal.toolList.forEach((tool: HttpToolConfigType, index: number) => {
        const newToolNode = getHTTPToolRuntimeNode({
          tool: {
            ...tool,
            name: `${toolSetNode.name}/${tool.name}`
          },
          nodeId: `${parentId}${index}`,
          avatar: toolSetNode.avatar,
          parentId
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
};

export const getNodeErrResponse = ({
  error,
  customErr,
  customNodeResponse
}: {
  error: any;
  customErr?: Record<string, any>;
  customNodeResponse?: Record<string, any>;
}) => {
  const errorText = getErrText(error);

  return {
    error: {
      [NodeOutputKeyEnum.errorText]: errorText,
      ...(typeof customErr === 'object' ? customErr : {})
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      errorText,
      ...(typeof customNodeResponse === 'object' ? customNodeResponse : {})
    },
    [DispatchNodeResponseKeyEnum.toolResponses]: {
      error: errorText,
      ...(typeof customErr === 'object' ? customErr : {})
    }
  };
};
