import { getErrText } from '@fastgpt/global/common/error/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  RuntimeEdgeItemType,
  SystemVariablesType
} from '@fastgpt/global/core/workflow/runtime/type';
import { responseWrite } from '../../../common/response';
import { NextApiResponse } from 'next';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import json5 from 'json5';

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
    data,
    stream
  }: {
    write?: (text: string) => void;
    event: SseResponseEventEnum;
    data: Record<string, any>;
    stream?: boolean; // Focus set stream response
  }) => {
    const useStreamResponse = stream ?? streamResponse;

    if (!res || res.closed || !useStreamResponse) return;

    // Forbid show detail
    const detailEvent: Record<string, 1> = {
      [SseResponseEventEnum.error]: 1,
      [SseResponseEventEnum.flowNodeStatus]: 1,
      [SseResponseEventEnum.flowResponses]: 1,
      [SseResponseEventEnum.interactive]: 1,
      [SseResponseEventEnum.toolCall]: 1,
      [SseResponseEventEnum.toolParams]: 1,
      [SseResponseEventEnum.toolResponse]: 1,
      [SseResponseEventEnum.updateVariables]: 1,
      [SseResponseEventEnum.flowNodeResponse]: 1
    };
    if (!detail && detailEvent[event]) return;

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

  const systemHistories = histories.filter((item) => item.obj === ChatRoleEnum.System);

  const filterHistories = (() => {
    if (typeof history === 'number') return histories.slice(-(history * 2));
    if (Array.isArray(history)) return history;
    return [];
  })();

  return [...systemHistories, ...filterHistories];
};

/* value type format */
export const valueTypeFormat = (value: any, type?: WorkflowIOValueTypeEnum) => {
  // 1. 基础条件检查
  if (value === undefined || value === null) return;
  if (!type || type === WorkflowIOValueTypeEnum.any) return value;

  // 2. 如果值已经符合目标类型，直接返回
  if (
    (type === WorkflowIOValueTypeEnum.string && typeof value === 'string') ||
    (type === WorkflowIOValueTypeEnum.number && typeof value === 'number') ||
    (type === WorkflowIOValueTypeEnum.boolean && typeof value === 'boolean') ||
    (type === WorkflowIOValueTypeEnum.object &&
      typeof value === 'object' &&
      !Array.isArray(value)) ||
    (type.startsWith('array') && Array.isArray(value))
  ) {
    return value;
  }

  // 3. 处理JSON字符串
  if (type === WorkflowIOValueTypeEnum.object || type.startsWith('array')) {
    if (typeof value === 'string' && value.trim()) {
      const trimmedValue = value.trim();
      const isJsonLike =
        (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) ||
        (trimmedValue.startsWith('[') && trimmedValue.endsWith(']'));

      if (isJsonLike) {
        try {
          const parsed = json5.parse(trimmedValue);

          // 解析结果与目标类型匹配时使用解析后的值
          if (
            (Array.isArray(parsed) && type.startsWith('array')) ||
            (type === WorkflowIOValueTypeEnum.object &&
              typeof parsed === 'object' &&
              !Array.isArray(parsed))
          ) {
            return parsed;
          }
        } catch (error) {
          // 解析失败时继续使用原始值
        }
      }
    }
  }

  // 4. 按类型处理
  // 4.1 数组类型
  if (type.startsWith('array')) {
    // 数组类型的特殊处理：字符串转为单元素数组
    if (type === WorkflowIOValueTypeEnum.arrayString && typeof value === 'string') {
      return [value];
    }
    // 其他值包装为数组
    return [value];
  }

  // 4.2 基本类型转换
  if (type === WorkflowIOValueTypeEnum.string) {
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  if (type === WorkflowIOValueTypeEnum.number) {
    return Number(value);
  }

  if (type === WorkflowIOValueTypeEnum.boolean) {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  }

  // 4.3 复杂对象类型处理
  if (
    [
      WorkflowIOValueTypeEnum.object,
      WorkflowIOValueTypeEnum.chatHistory,
      WorkflowIOValueTypeEnum.datasetQuote,
      WorkflowIOValueTypeEnum.selectApp,
      WorkflowIOValueTypeEnum.selectDataset
    ].includes(type) &&
    typeof value !== 'object'
  ) {
    try {
      return json5.parse(value);
    } catch (error) {
      return value;
    }
  }

  // 5. 默认返回原值
  return value;
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
