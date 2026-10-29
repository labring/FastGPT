import { AgentAskInteractiveSchema } from '../../ai/agent/type';
import json5 from 'json5';
import { ChatRoleEnum } from '../../../core/chat/constants';
import type { ChatItemMiniType } from '../../../core/chat/type';
import type { NodeOutputItemType, RuntimeNodeItemType } from './type';
import { createChatCompletionDeltaResponse } from '../../ai/llm/utils';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '../constants';
import { FlowNodeTypeEnum } from '../node/constant';
import { type WorkflowInteractiveResponseType } from '../template/system/interactive/type';
import { WorkflowBuilderPreviewInteractiveSchema } from '../builder/type';
import type { RuntimeEdgeItemType, StoreEdgeItemType } from '../type/edge';
import type { FlowNodeOutputItemType, ReferenceValueType } from '../type/io';
import type { StoreNodeItemType } from '../type/node';
import { isValidReferenceValueFormat } from '../../../common/workflow/reference';
import { parseSecretValue } from '../../../common/secret/utils';
import { isChildInteractive } from '../template/system/interactive/constants';

/**
 * 统一判断 Agent Ask 类型，供运行时交互及结构化用户输入共用，并保留调用方的具体类型。
 * 只判断当前层标记；嵌套工作流交互需先通过 extractDeepestInteractive 提取。
 */
export const isAgentAskInteractive = <T extends { type: string }>(
  interactive: T | null | undefined
): interactive is T & { type: 'agentAsk' } => interactive?.type === 'agentAsk';

/**
 * 识别通过新建 user 消息回答的 Ask 交互，统一 Agent Ask 和工作流方案确认的公共行为。
 * 只判断当前层类型，不校验载荷；嵌套交互需先通过 extractDeepestInteractive 提取。
 */
export const isAskInteractive = <T extends { type: string }>(
  interactive: T | null | undefined
): interactive is T & { type: 'agentAsk' | 'workflowBuilderPreview' } =>
  isAgentAskInteractive(interactive) || interactive?.type === 'workflowBuilderPreview';

export const extractDeepestInteractive = (
  interactive: WorkflowInteractiveResponseType
): WorkflowInteractiveResponseType => {
  const MAX_DEPTH = 100;
  let current = interactive;
  let depth = 0;

  while (depth < MAX_DEPTH && current?.params && 'childrenResponse' in current.params) {
    current = current.params.childrenResponse;
    depth++;
  }

  return current;
};
export const getMaxHistoryLimitFromNodes = (nodes: StoreNodeItemType[]): number => {
  // Agent 的恢复来源是完整 ChatItem；Mongo limit=0 表示不裁剪，模型侧仍按最新 checkpoint 压缩。
  if (
    nodes.some(
      (node) =>
        node.flowNodeType === FlowNodeTypeEnum.agent ||
        node.flowNodeType === FlowNodeTypeEnum.toolCall
    )
  )
    return 0;
  let limit = 10;
  nodes.forEach((node) => {
    node.inputs.forEach((input) => {
      if (
        (input.key === NodeInputKeyEnum.history ||
          input.key === NodeInputKeyEnum.historyMaxAmount) &&
        typeof input.value === 'number'
      ) {
        limit = Math.max(limit, input.value);
      }
    });
  });

  return limit * 2;
};

/** 按目标 workflow 类型转换运行时值；只有密码输入会保留合法 secret wrapper。 */
export const valueTypeFormat = (
  value: any,
  valueType?: WorkflowIOValueTypeEnum,
  isSecretInput = false
) => {
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

  // Handle null/undefined, return default value by type
  if (value === undefined || value === null) return value;
  if (!valueType || valueType === WorkflowIOValueTypeEnum.any) return value;

  // `{ value }` 也可能是普通业务对象；仅密码输入按密钥 wrapper 透传。
  if (isSecretInput && valueType === WorkflowIOValueTypeEnum.string) {
    const secretValue = parseSecretValue(value);
    if (secretValue) return secretValue;
  }

  // 2. 如果值已经符合目标类型，直接返回
  if (
    (valueType === WorkflowIOValueTypeEnum.string && typeof value === 'string') ||
    (valueType === WorkflowIOValueTypeEnum.number && typeof value === 'number') ||
    (valueType === WorkflowIOValueTypeEnum.boolean && typeof value === 'boolean') ||
    (valueType?.startsWith('array') && Array.isArray(value)) ||
    (valueType === WorkflowIOValueTypeEnum.object && typeof value === 'object') ||
    (valueType === WorkflowIOValueTypeEnum.chatHistory &&
      (Array.isArray(value) || typeof value === 'number')) ||
    (valueType === WorkflowIOValueTypeEnum.datasetQuote && Array.isArray(value)) ||
    (valueType === WorkflowIOValueTypeEnum.selectDataset && Array.isArray(value)) ||
    (valueType === WorkflowIOValueTypeEnum.selectApp && typeof value === 'object')
  ) {
    return value;
  }

  // 4. 按目标类型，进行格式转化
  // 4.1 基本类型转换
  if (valueType === WorkflowIOValueTypeEnum.string) {
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  if (valueType === WorkflowIOValueTypeEnum.number) {
    if (value === '') return null;
    return Number(value);
  }
  if (valueType === WorkflowIOValueTypeEnum.boolean) {
    // 统一使用 JS 原生 Boolean 语义（非空字符串为 true），与 formatVariableValByType 保持一致
    return Boolean(value);
  }

  // 4.3 字符串转对象
  if (valueType === WorkflowIOValueTypeEnum.object) {
    if (isObjectString(value)) {
      const trimmedValue = value.trim();
      try {
        return json5.parse(trimmedValue);
      } catch {}
    }
    return {};
  }

  // 4.4 数组类型(这里 value 不是数组类型)（TODO: 嵌套数据类型转化）
  if (valueType?.startsWith('array')) {
    if (isObjectString(value)) {
      try {
        const parsed = json5.parse(value);
        // 单个对象的 JSON 字符串与其他非数组值一样包成单元素数组，
        // 否则数组类型的输入拿到的是对象，循环/并行节点会报「不是数组」
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {}
    }
    return [value];
  }

  // 4.5 特殊类型处理
  if (
    [
      WorkflowIOValueTypeEnum.datasetQuote,
      WorkflowIOValueTypeEnum.selectDataset,
      WorkflowIOValueTypeEnum.selectApp
    ].includes(valueType as any)
  ) {
    if (isObjectString(value)) {
      try {
        return json5.parse(value);
      } catch {}
    }
    return [];
  }

  // Invalid history type
  if (valueType === WorkflowIOValueTypeEnum.chatHistory) {
    if (isObjectString(value)) {
      try {
        return json5.parse(value);
      } catch {}
    }
    return [];
  }

  // 5. 默认返回原值
  return value;
};

/*
  Get interaction information (if any) from the last AI message.
  What can be done:
  1. Get the interactive data
  2. Check that the workflow starts at the interaction node
*/
export const getLastInteractiveValue = (
  histories: ChatItemMiniType[]
): WorkflowInteractiveResponseType | undefined => {
  const lastAIIndex = histories.findLastIndex((item) => item.obj === ChatRoleEnum.AI);
  const lastAIMessage = histories[lastAIIndex];

  if (lastAIMessage?.obj === ChatRoleEnum.AI) {
    const lastValue = lastAIMessage.value.findLast(
      (value) =>
        !value.displayOnly && !value.workflowBuilderVersion && !value.chatAgentBuilderVersion
    );

    if (!lastValue || !lastValue.interactive) {
      return;
    }

    const finalInteractive = extractDeepestInteractive(lastValue.interactive);
    if (!finalInteractive) return;
    if (isAskInteractive(finalInteractive)) {
      const schema = isAgentAskInteractive(finalInteractive)
        ? AgentAskInteractiveSchema
        : WorkflowBuilderPreviewInteractiveSchema;
      if (!schema.safeParse(finalInteractive).success) return;
      return histories[lastAIIndex + 1]?.obj === ChatRoleEnum.Human
        ? undefined
        : lastValue.interactive;
    }

    if (isChildInteractive(lastValue.interactive.type)) {
      return lastValue.interactive;
    }

    // Check is user select
    if (
      lastValue.interactive.type === 'userSelect' &&
      !lastValue.interactive?.params?.userSelectedVal
    ) {
      return lastValue.interactive;
    }

    // Check is user input
    if (lastValue.interactive.type === 'userInput' && !lastValue.interactive?.params?.submitted) {
      return lastValue.interactive;
    }

    if (lastValue.interactive.type === 'paymentPause' && !lastValue.interactive.params.continue) {
      return lastValue.interactive;
    }
  }

  return;
};

export const storeEdges2RuntimeEdges = (
  edges: StoreEdgeItemType[],
  lastInteractive?: WorkflowInteractiveResponseType
): RuntimeEdgeItemType[] => {
  if (lastInteractive) {
    const memoryEdges = lastInteractive.memoryEdges || [];
    if (memoryEdges && memoryEdges.length > 0) {
      return memoryEdges.map((edge) => ({ ...edge }));
    }
  }

  return edges?.map((edge) => ({ ...edge, status: 'waiting' })) || [];
};

export const getWorkflowEntryNodeIds = (
  nodes: (StoreNodeItemType | RuntimeNodeItemType)[],
  lastInteractive?: WorkflowInteractiveResponseType
) => {
  if (lastInteractive) {
    const entryNodeIds = lastInteractive.entryNodeIds || [];
    if (Array.isArray(entryNodeIds) && entryNodeIds.length > 0) {
      return entryNodeIds;
    }
  }

  const entryList = [FlowNodeTypeEnum.workflowStart, FlowNodeTypeEnum.pluginInput];
  return nodes
    .filter(
      (node) =>
        entryList.includes(node.flowNodeType as any) ||
        (!nodes.some((item) => entryList.includes(item.flowNodeType as any)) &&
          node.flowNodeType === FlowNodeTypeEnum.tool)
    )
    .map((item) => item.nodeId);
};

export const storeNodes2RuntimeNodes = (
  nodes: StoreNodeItemType[],
  entryNodeIds: string[]
): RuntimeNodeItemType[] => {
  return (
    nodes.map<RuntimeNodeItemType>((node) => {
      return {
        nodeId: node.nodeId,
        ...(node.parentNodeId !== undefined ? { parentNodeId: node.parentNodeId } : {}),
        name: node.name,
        avatar: node.avatar,
        intro: node.intro,
        flowNodeType: node.flowNodeType,
        showStatus: node.showStatus,
        isEntry: entryNodeIds.includes(node.nodeId),
        inputs: node.inputs,
        outputs: node.outputs,
        pluginId: node.pluginId,
        version: node.version,
        ...(node.metadataLocale !== undefined ? { metadataLocale: node.metadataLocale } : {}),
        toolConfig: node.toolConfig,
        catchError: node.catchError
      };
    }) || []
  );
};

export const filterWorkflowEdges = (edges: RuntimeEdgeItemType[]) => {
  return edges.filter(
    (edge) =>
      edge.sourceHandle !== NodeOutputKeyEnum.selectedTools &&
      edge.targetHandle !== NodeOutputKeyEnum.selectedTools
  );
};

/**
 * 解析单个或批量工作流引用；死引用返回 undefined，避免引用元组传入下游。
 * 二维表行与引用元组同为 string[]，字面值需传 isReferenceVal: false，不能仅靠数组结构区分。
 */
export const getReferenceVariableValue = ({
  value,
  nodesMap,
  variables,
  isReferenceVal = true
}: {
  value?: ReferenceValueType;
  nodesMap: Record<string, RuntimeNodeItemType> | Map<string, RuntimeNodeItemType>;
  variables: Record<string, unknown>;
  isReferenceVal?: boolean;
}) => {
  if (!isReferenceVal || !value) return value;

  /** 解析单个引用：全局变量走 variables，节点输出走 nodesMap；来源缺失一律 undefined。 */
  const resolveValue = (value: [string, string | undefined]) => {
    const sourceNodeId = value[0];
    const outputId = value[1];

    if (sourceNodeId === VARIABLE_NODE_ID) {
      if (!outputId) return undefined;
      return variables[outputId];
    }

    const node = nodesMap instanceof Map ? nodesMap.get(sourceNodeId) : nodesMap[sourceNodeId];
    if (!node) return undefined;

    return node.outputs.find((output) => output.id === outputId)?.value;
  };

  const isReferenceValue = (value: unknown): value is [string, string | undefined] =>
    isValidReferenceValueFormat(value) && (value[1] === undefined || typeof value[1] === 'string');

  // handle single reference value
  if (isReferenceValue(value)) {
    return resolveValue(value as [string, string | undefined]);
  }

  // 普通数组不是引用集合，不能因没有 reference 被清空。
  if (!Array.isArray(value) || !value.some(Array.isArray)) return value;

  // 引用数组只保留形状正确的项；来源缺失或输出缺失由 resolveValue 转成 undefined 后过滤。
  const references = value.filter(isReferenceValue);
  if (references.length === 0) return undefined;
  const resolved = references
    .map((val) => resolveValue(val as [string, string | undefined]))
    .flat()
    .filter((item) => item !== undefined);
  return resolved.length > 0 ? resolved : undefined;
};

export const formatVariableValByType = (val: any, valueType?: WorkflowIOValueTypeEnum) => {
  if (!valueType) return val;
  if (val === undefined || val === null) return;
  // Value type check, If valueType invalid, return undefined
  if (valueType.startsWith('array') && !Array.isArray(val)) return undefined;
  if (valueType === WorkflowIOValueTypeEnum.boolean) return Boolean(val);
  if (valueType === WorkflowIOValueTypeEnum.number) return Number(val);
  if (valueType === WorkflowIOValueTypeEnum.string) {
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  }
  if (
    [
      WorkflowIOValueTypeEnum.object,
      WorkflowIOValueTypeEnum.datasetQuote,
      WorkflowIOValueTypeEnum.selectApp,
      WorkflowIOValueTypeEnum.selectDataset
    ].includes(valueType) &&
    typeof val !== 'object'
  )
    return undefined;

  return val;
};

export const textAdaptGptResponse = ({
  text,
  reasoning_content,
  model = '',
  finish_reason = null,
  extraData = {}
}: {
  model?: string;
  text?: string | null;
  reasoning_content?: string | null;
  finish_reason?: null | 'stop';
  extraData?: object;
}) => {
  return createChatCompletionDeltaResponse({
    text,
    reasoningContent: reasoning_content,
    model,
    finishReason: finish_reason,
    extraData
  });
};

/* Update runtimeNode's outputs with interactive data from history */
export function rewriteNodeOutputByHistories(
  runtimeNodes: RuntimeNodeItemType[],
  lastInteractive?: WorkflowInteractiveResponseType
) {
  const interactive = lastInteractive;
  if (!interactive?.nodeOutputs) {
    return runtimeNodes;
  }

  return runtimeNodes.map((node) => {
    return {
      ...node,
      outputs: node.outputs.map((output: FlowNodeOutputItemType) => {
        return {
          ...output,
          value: (() => {
            const nodeOutput = interactive.nodeOutputs?.find(
              (item: NodeOutputItemType) => item.nodeId === node.nodeId && item.key === output.key
            );
            return nodeOutput ? nodeOutput.value : output.value;
          })()
        };
      })
    };
  });
}

/** 补齐交互的工作流恢复字段，按调用 ID 更新唯一 value，不回写历史 AI。 */
export const appendWorkflowInteractiveValue = ({
  values,
  interactive
}: {
  values: import('../../chat/type').AIChatItemValueItemType[];
  interactive: WorkflowInteractiveResponseType;
}) => {
  const latest = extractDeepestInteractive(interactive);
  if (isAskInteractive(latest)) {
    const existing = values.find((value) => {
      if (value.displayOnly || !value.interactive) return false;
      const current = extractDeepestInteractive(value.interactive);
      return isAgentAskInteractive(latest)
        ? !!latest.params?.toolCallId &&
            isAgentAskInteractive(current) &&
            current.params?.toolCallId === latest.params.toolCallId
        : current?.type === 'workflowBuilderPreview' &&
            current.params.toolCallId === latest.params.toolCallId;
    });
    if (existing) {
      existing.interactive = interactive;
      return;
    }
  }
  values.push({ interactive });
};
