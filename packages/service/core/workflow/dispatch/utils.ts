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
  const isObjectString = (value: any) => {
    if (typeof value === 'string' && value !== 'false' && value !== 'true') {
      const trimmedValue = value.trim();
      const isJsonString =
        (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) ||
        (trimmedValue.startsWith('[') && trimmedValue.endsWith(']'));
      return isJsonString;
    }
    return false;
  };

  // 1. any值，忽略格式化
  if (!type || type === WorkflowIOValueTypeEnum.any) return value;

  // 2. 如果值已经符合目标类型，直接返回
  if (
    (type === WorkflowIOValueTypeEnum.string && typeof value === 'string') ||
    (type === WorkflowIOValueTypeEnum.number && typeof value === 'number') ||
    (type === WorkflowIOValueTypeEnum.boolean && typeof value === 'boolean') ||
    (type.startsWith('array') && Array.isArray(value)) ||
    (type === WorkflowIOValueTypeEnum.object && typeof value === 'object') ||
    (type === WorkflowIOValueTypeEnum.chatHistory && Array.isArray(value)) ||
    (type === WorkflowIOValueTypeEnum.datasetQuote && Array.isArray(value)) ||
    (type === WorkflowIOValueTypeEnum.selectDataset && Array.isArray(value)) ||
    (type === WorkflowIOValueTypeEnum.selectApp && typeof value === 'object')
  ) {
    return value;
  }

  // 3. 空值处理
  if (value === undefined || value === null) {
    if (type === WorkflowIOValueTypeEnum.string) return '';
    if (type === WorkflowIOValueTypeEnum.number) return 0;
    if (type === WorkflowIOValueTypeEnum.boolean) return false;
    if (type.startsWith('array')) return [];
    if (type === WorkflowIOValueTypeEnum.object) return {};
    if (type === WorkflowIOValueTypeEnum.chatHistory) return [];
    if (type === WorkflowIOValueTypeEnum.datasetQuote) return [];
    if (type === WorkflowIOValueTypeEnum.selectDataset) return [];
    if (type === WorkflowIOValueTypeEnum.selectApp) return {};
  }

  // 4. 按目标类型，进行格式转化
  // 4.1 基本类型转换
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

  // 4.3 字符串转对象
  if (
    (type === WorkflowIOValueTypeEnum.object || type.startsWith('array')) &&
    typeof value === 'string' &&
    value.trim()
  ) {
    const trimmedValue = value.trim();
    const isJsonString = isObjectString(trimmedValue);

    if (isJsonString) {
      try {
        const parsed = json5.parse(trimmedValue);
        // 检测解析结果与目标类型是否一致
        if (type.startsWith('array') && Array.isArray(parsed)) return parsed;
        if (type === WorkflowIOValueTypeEnum.object && typeof parsed === 'object') return parsed;
      } catch (error) {}
    }
  }

  // 4.4 数组类型(这里 value 不是数组类型)（TODO: 嵌套数据类型转化）
  if (type.startsWith('array')) {
    return [value];
  }

  // 4.5 特殊类型处理
  if (
    [
      WorkflowIOValueTypeEnum.chatHistory,
      WorkflowIOValueTypeEnum.datasetQuote,
      WorkflowIOValueTypeEnum.selectDataset
    ].includes(type)
  ) {
    if (isObjectString(value)) {
      try {
        return json5.parse(value);
      } catch (error) {
        return [];
      }
    }
    return [];
  }
  if (
    [WorkflowIOValueTypeEnum.selectApp, WorkflowIOValueTypeEnum.object].includes(type) &&
    typeof value === 'string'
  ) {
    if (isObjectString(value)) {
      try {
        return json5.parse(value);
      } catch (error) {
        return {};
      }
    }
    return {};
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
