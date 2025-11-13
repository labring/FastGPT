import json5 from 'json5';
import { replaceVariable, valToStr } from '../../../common/string/tools';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '../../../core/chat/constants';
import type { ChatItemType, NodeOutputItemType } from '../../../core/chat/type';
import { ChatCompletionRequestMessageRoleEnum } from '../../ai/constants';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '../constants';
import { FlowNodeTypeEnum } from '../node/constant';
import {
  type InteractiveNodeResponseType,
  type WorkflowInteractiveResponseType
} from '../template/system/interactive/type';
import type { StoreEdgeItemType } from '../type/edge';
import type { FlowNodeOutputItemType, ReferenceValueType } from '../type/io';
import type { StoreNodeItemType } from '../type/node';
import { isValidReferenceValueFormat } from '../utils';
import type { RuntimeEdgeItemType, RuntimeNodeItemType } from './type';
import { isSecretValue } from '../../../common/secret/utils';
import { isChildInteractive } from '../template/system/interactive/constants';

export const extractDeepestInteractive = (
  interactive: WorkflowInteractiveResponseType
): WorkflowInteractiveResponseType => {
  const MAX_DEPTH = 100;
  let current = interactive;
  let depth = 0;

  while (depth < MAX_DEPTH && 'childrenResponse' in current.params) {
    current = current.params.childrenResponse;
    depth++;
  }

  return current;
};
export const getMaxHistoryLimitFromNodes = (nodes: StoreNodeItemType[]): number => {
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

/* value type format */
export const valueTypeFormat = (value: any, valueType?: WorkflowIOValueTypeEnum) => {
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
  if (value === undefined || value === null) return value;
  if (!valueType || valueType === WorkflowIOValueTypeEnum.any) return value;

  // Password check
  if (valueType === WorkflowIOValueTypeEnum.string && isSecretValue(value)) return value;

  // 2. 如果值已经符合目标类型，直接返回
  if (
    (valueType === WorkflowIOValueTypeEnum.string && typeof value === 'string') ||
    (valueType === WorkflowIOValueTypeEnum.number && typeof value === 'number') ||
    (valueType === WorkflowIOValueTypeEnum.boolean && typeof value === 'boolean') ||
    (valueType.startsWith('array') && Array.isArray(value)) ||
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
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  }

  // 4.3 字符串转对象
  if (valueType === WorkflowIOValueTypeEnum.object) {
    if (isObjectString(value)) {
      const trimmedValue = value.trim();
      try {
        return json5.parse(trimmedValue);
      } catch (error) {}
    }
    return {};
  }

  // 4.4 数组类型(这里 value 不是数组类型)（TODO: 嵌套数据类型转化）
  if (valueType.startsWith('array')) {
    if (isObjectString(value)) {
      try {
        return json5.parse(value);
      } catch (error) {}
    }
    return [value];
  }

  // 4.5 特殊类型处理
  if (
    [
      WorkflowIOValueTypeEnum.datasetQuote,
      WorkflowIOValueTypeEnum.selectDataset,
      WorkflowIOValueTypeEnum.selectApp
    ].includes(valueType)
  ) {
    if (isObjectString(value)) {
      try {
        return json5.parse(value);
      } catch (error) {}
    }
    return [];
  }

  // Invalid history type
  if (valueType === WorkflowIOValueTypeEnum.chatHistory) {
    if (isObjectString(value)) {
      try {
        return json5.parse(value);
      } catch (error) {}
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
  histories: ChatItemType[]
): WorkflowInteractiveResponseType | undefined => {
  const lastAIMessage = [...histories].reverse().find((item) => item.obj === ChatRoleEnum.AI);

  if (lastAIMessage) {
    const lastValue = lastAIMessage.value[lastAIMessage.value.length - 1];

    if (
      !lastValue ||
      lastValue.type !== ChatItemValueTypeEnum.interactive ||
      !lastValue.interactive
    ) {
      return;
    }

    if (isChildInteractive(lastValue.interactive.type)) {
      return lastValue.interactive;
    }

    // Check is user select
    if (
      lastValue.interactive.type === 'userSelect' &&
      !lastValue.interactive.params.userSelectedVal
    ) {
      return lastValue.interactive;
    }

    // Check is user input
    if (lastValue.interactive.type === 'userInput' && !lastValue.interactive.params.submitted) {
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
      return memoryEdges;
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

  const entryList = [
    FlowNodeTypeEnum.systemConfig,
    FlowNodeTypeEnum.workflowStart,
    FlowNodeTypeEnum.pluginInput
  ];
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
        name: node.name,
        avatar: node.avatar,
        intro: node.intro,
        toolDescription: node.toolDescription,
        flowNodeType: node.flowNodeType,
        showStatus: node.showStatus,
        isEntry: entryNodeIds.includes(node.nodeId),
        inputs: node.inputs,
        outputs: node.outputs,
        pluginId: node.pluginId,
        version: node.version,
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

/*
  1. 输入线分类：普通线(实际上就是从 start 直接过来的分支）和递归线（可以追溯到自身的分支）
  2. 递归线，会根据最近的一个 target 分支进行分类，同一个分支的属于一组
  2. 起始线全部非 waiting 执行，或递归线任意一组全部非 waiting 执行
*/
export const checkNodeRunStatus = ({
  nodesMap,
  node,
  runtimeEdges
}: {
  nodesMap: Map<string, RuntimeNodeItemType>;
  node: RuntimeNodeItemType;
  runtimeEdges: RuntimeEdgeItemType[];
}) => {
  const isStartNode = (nodeType: string) => {
    const map: Record<any, boolean> = {
      [FlowNodeTypeEnum.workflowStart]: true,
      [FlowNodeTypeEnum.pluginInput]: true,
      [FlowNodeTypeEnum.loopStart]: true
    };
    return !!map[nodeType];
  };
  const splitNodeEdges = (targetNode: RuntimeNodeItemType) => {
    const commonEdges: RuntimeEdgeItemType[] = [];
    const recursiveEdgeGroupsMap = new Map<string, RuntimeEdgeItemType[]>();

    const sourceEdges = runtimeEdges.filter((item) => item.target === targetNode.nodeId);

    sourceEdges.forEach((sourceEdge) => {
      const stack: Array<{
        edge: RuntimeEdgeItemType;
        visited: Set<string>;
      }> = [
        {
          edge: sourceEdge,
          visited: new Set([targetNode.nodeId])
        }
      ];
      const MAX_DEPTH = 3000;
      let iterations = 0;

      while (stack.length > 0 && iterations < MAX_DEPTH) {
        iterations++;
        const { edge, visited } = stack.pop()!;

        // Start node
        const sourceNode = nodesMap.get(edge.source);
        if (!sourceNode) continue;

        if (isStartNode(sourceNode.flowNodeType) || sourceEdge.sourceHandle === 'selectedTools') {
          commonEdges.push(sourceEdge);
          continue;
        }

        // Circle detected
        if (edge.source === targetNode.nodeId) {
          recursiveEdgeGroupsMap.set(edge.target, [
            ...(recursiveEdgeGroupsMap.get(edge.target) || []),
            sourceEdge
          ]);
          continue;
        }

        if (visited.has(edge.source)) {
          continue; // 已访问过此节点，跳过（避免子环干扰）
        }

        const newVisited = new Set(visited);
        newVisited.add(edge.source);

        // 查找目标节点的 source edges 并加入栈中
        const nextEdges = runtimeEdges.filter((item) => item.target === edge.source);

        for (const nextEdge of nextEdges) {
          stack.push({
            edge: nextEdge,
            visited: newVisited
          });
        }
      }
    });

    return { commonEdges, recursiveEdgeGroups: Array.from(recursiveEdgeGroupsMap.values()) };
  };

  // Classify edges
  const { commonEdges, recursiveEdgeGroups } = splitNodeEdges(node);

  // Entry
  if (commonEdges.length === 0 && recursiveEdgeGroups.length === 0) {
    return 'run';
  }

  // check active（其中一组边，至少有一个 active，且没有 waiting 即可运行）
  if (
    commonEdges.some((item) => item.status === 'active') &&
    commonEdges.every((item) => item.status !== 'waiting')
  ) {
    return 'run';
  }
  if (
    recursiveEdgeGroups.some(
      (item) =>
        item.some((item) => item.status === 'active') &&
        item.every((item) => item.status !== 'waiting')
    )
  ) {
    return 'run';
  }

  // check skip（其中一组边，全是 skiped 则跳过运行）
  if (commonEdges.length > 0 && commonEdges.every((item) => item.status === 'skipped')) {
    return 'skip';
  }
  if (
    recursiveEdgeGroups.length > 0 &&
    recursiveEdgeGroups.some((item) => item.every((item) => item.status === 'skipped'))
  ) {
    return 'skip';
  }

  return 'wait';
};

/*
  Get the value of the reference variable/node output
  1. [string,string]
  2. [string,string][]
*/
export const getReferenceVariableValue = ({
  value,
  nodes,
  variables
}: {
  value?: ReferenceValueType;
  nodes: RuntimeNodeItemType[];
  variables: Record<string, any>;
}) => {
  if (!value) return value;

  // handle single reference value
  if (isValidReferenceValueFormat(value)) {
    const sourceNodeId = value[0];
    const outputId = value[1];

    if (sourceNodeId === VARIABLE_NODE_ID) {
      if (!outputId) return undefined;
      return variables[outputId];
    }

    // 避免 value 刚好就是二个元素的字符串数组
    const node = nodes.find((node) => node.nodeId === sourceNodeId);
    if (!node) {
      return value;
    }

    return node.outputs.find((output) => output.id === outputId)?.value;
  }

  // handle reference array
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => isValidReferenceValueFormat(item))
  ) {
    const result = value.map<any>((val) => {
      return getReferenceVariableValue({
        value: val,
        nodes,
        variables
      });
    });

    return result.flat().filter((item) => item !== undefined);
  }

  return value;
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

// replace {{$xx.xx$}} variables for text
export function replaceEditorVariable({
  text,
  nodes,
  variables,
  depth = 0
}: {
  text: any;
  nodes: RuntimeNodeItemType[];
  variables: Record<string, any>; // global variables
  depth?: number;
}) {
  if (typeof text !== 'string') return text;
  if (text === '') return text;

  const MAX_REPLACEMENT_DEPTH = 10;
  const processedVariables = new Set<string>();

  // Prevent infinite recursion
  if (depth > MAX_REPLACEMENT_DEPTH) {
    return text;
  }

  text = replaceVariable(text, variables);

  // Check for circular references in variable values
  const hasCircularReference = (value: any, targetKey: string): boolean => {
    if (typeof value !== 'string') return false;

    // Check if the value contains the target variable pattern (direct self-reference)
    const selfRefPattern = new RegExp(
      `\\{\\{\\$${targetKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\$\\}\\}`,
      'g'
    );
    return selfRefPattern.test(value);
  };

  const variablePattern = /\{\{\$([^.]+)\.([^$]+)\$\}\}/g;
  const matches = [...text.matchAll(variablePattern)];
  if (matches.length === 0) return text;

  let result = text;
  let hasReplacements = false;

  // Build replacement map first to avoid modifying string during iteration
  const replacements: Array<{ pattern: string; replacement: string }> = [];

  for (const match of matches) {
    const nodeId = match[1];
    const id = match[2];
    const variableKey = `${nodeId}.${id}`;

    // Skip if already processed to avoid immediate circular reference
    if (processedVariables.has(variableKey)) {
      continue;
    }

    const variableVal = (() => {
      if (nodeId === VARIABLE_NODE_ID) {
        return variables[id];
      }
      // Find upstream node input/output
      const node = nodes.find((node) => node.nodeId === nodeId);
      if (!node) return;

      const output = node.outputs.find((output) => output.id === id);
      if (output) return formatVariableValByType(output.value, output.valueType);

      // Use the node's input as the variable value(Example: HTTP data will reference its own dynamic input)
      const input = node.inputs.find((input) => input.key === id);
      if (input) return getReferenceVariableValue({ value: input.value, nodes, variables });
    })();

    // Check for direct circular reference
    if (hasCircularReference(String(variableVal), variableKey)) {
      continue;
    }

    const formatVal = valToStr(variableVal);
    const escapedNodeId = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    replacements.push({
      pattern: `\\{\\{\\$(${escapedNodeId}\\.${escapedId})\\$\\}\\}`,
      replacement: formatVal
    });

    processedVariables.add(variableKey);
    hasReplacements = true;
  }

  // Apply all replacements
  replacements.forEach(({ pattern, replacement }) => {
    result = result.replace(new RegExp(pattern, 'g'), replacement);
  });

  // If we made replacements and there might be nested variables, recursively process
  if (hasReplacements && /\{\{\$[^.]+\.[^$]+\$\}\}/.test(result)) {
    result = replaceEditorVariable({ text: result, nodes, variables, depth: depth + 1 });
  }

  return result || '';
}

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
  extraData?: Object;
}) => {
  return {
    ...extraData,
    id: '',
    object: '',
    created: 0,
    model,
    choices: [
      {
        delta: {
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content: text,
          ...(reasoning_content && { reasoning_content })
        },
        index: 0,
        finish_reason
      }
    ]
  };
};

/* Update runtimeNode's outputs with interactive data from history */
export function rewriteNodeOutputByHistories(
  runtimeNodes: RuntimeNodeItemType[],
  lastInteractive?: InteractiveNodeResponseType
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
          value:
            interactive?.nodeOutputs?.find(
              (item: NodeOutputItemType) => item.nodeId === node.nodeId && item.key === output.key
            )?.value || output?.value
        };
      })
    };
  });
}
