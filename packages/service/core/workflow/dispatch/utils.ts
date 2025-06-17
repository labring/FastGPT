import { getErrText } from '@fastgpt/global/common/error/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  type RuntimeEdgeItemType,
  type RuntimeNodeItemType,
  type SystemVariablesType
} from '@fastgpt/global/core/workflow/runtime/type';
import { responseWrite } from '../../../common/response';
import { type NextApiResponse } from 'next';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { type SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/mcpTools/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { McpToolSetDataType } from '@fastgpt/global/core/app/mcpTools/type';

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

  const systemHistoryIndex = histories.findIndex((item) => item.obj !== ChatRoleEnum.System);
  const systemHistories = histories.slice(0, systemHistoryIndex);
  const chatHistories = histories.slice(systemHistoryIndex);

  const filterHistories = (() => {
    if (typeof history === 'number') return chatHistories.slice(-(history * 2));
    if (Array.isArray(history)) return history;
    return [];
  })();

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
export const removeSystemVariable = (
  variables: Record<string, any>,
  removeObj: Record<string, string> = {}
) => {
  const copyVariables = { ...variables };
  delete copyVariables.userId;
  delete copyVariables.appId;
  delete copyVariables.chatId;
  delete copyVariables.responseChatItemId;
  delete copyVariables.histories;
  delete copyVariables.cTime;

  // delete external provider workflow variables
  Object.keys(removeObj).forEach((key) => {
    delete copyVariables[key];
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

export const rewriteRuntimeWorkFlow = (
  nodes: RuntimeNodeItemType[],
  edges: RuntimeEdgeItemType[]
) => {
  const toolSetNodes = nodes.filter((node) => node.flowNodeType === FlowNodeTypeEnum.toolSet);

  if (toolSetNodes.length === 0) {
    return;
  }

  const nodeIdsToRemove = new Set<string>();

  for (const toolSetNode of toolSetNodes) {
    nodeIdsToRemove.add(toolSetNode.nodeId);
    const toolSetValue = toolSetNode.inputs[0]?.value as McpToolSetDataType | undefined;

    if (!toolSetValue) continue;

    const toolList = toolSetValue.toolList;
    const url = toolSetValue.url;
    const headerSecret = toolSetValue.headerSecret;

    const incomingEdges = edges.filter((edge) => edge.target === toolSetNode.nodeId);

    for (const tool of toolList) {
      const newToolNode = getMCPToolRuntimeNode({
        avatar: toolSetNode.avatar,
        tool,
        url,
        headerSecret
      });

      nodes.push({ ...newToolNode, name: `${toolSetNode.name} / ${tool.name}` });

      for (const inEdge of incomingEdges) {
        edges.push({
          source: inEdge.source,
          target: newToolNode.nodeId,
          sourceHandle: inEdge.sourceHandle,
          targetHandle: 'selectedTools',
          status: inEdge.status
        });
      }
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
