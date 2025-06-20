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

export const extractDeepestInteractive = (
  interactive: WorkflowInteractiveResponseType
): WorkflowInteractiveResponseType => {
  if (
    (interactive?.type === 'childrenInteractive' || interactive?.type === 'loopInteractive') &&
    interactive.params?.childrenResponse
  ) {
    return extractDeepestInteractive(interactive.params.childrenResponse);
  }
  return interactive;
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
  if (value === undefined || value === null) return value;
  if (!type || type === WorkflowIOValueTypeEnum.any) return value;

  // 2. 如果值已经符合目标类型，直接返回
  if (
    (type === WorkflowIOValueTypeEnum.string && typeof value === 'string') ||
    (type === WorkflowIOValueTypeEnum.number && typeof value === 'number') ||
    (type === WorkflowIOValueTypeEnum.boolean && typeof value === 'boolean') ||
    (type.startsWith('array') && Array.isArray(value)) ||
    (type === WorkflowIOValueTypeEnum.object && typeof value === 'object') ||
    (type === WorkflowIOValueTypeEnum.chatHistory &&
      (Array.isArray(value) || typeof value === 'number')) ||
    (type === WorkflowIOValueTypeEnum.datasetQuote && Array.isArray(value)) ||
    (type === WorkflowIOValueTypeEnum.selectDataset && Array.isArray(value)) ||
    (type === WorkflowIOValueTypeEnum.selectApp && typeof value === 'object')
  ) {
    return value;
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
    [WorkflowIOValueTypeEnum.datasetQuote, WorkflowIOValueTypeEnum.selectDataset].includes(type)
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
  // Invalid history type
  if (type === WorkflowIOValueTypeEnum.chatHistory) {
    return 0;
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

    if (
      lastValue.interactive.type === 'childrenInteractive' ||
      lastValue.interactive.type === 'loopInteractive'
    ) {
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
        flowNodeType: node.flowNodeType,
        showStatus: node.showStatus,
        isEntry: entryNodeIds.includes(node.nodeId),
        inputs: node.inputs,
        outputs: node.outputs,
        pluginId: node.pluginId,
        version: node.version,
        toolConfig: node.toolConfig
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
  1. 输入线分类：普通线和递归线（可以追溯到自身）
  2. 起始线全部非 waiting 执行，或递归线全部非 waiting 执行
*/
export const checkNodeRunStatus = ({
  node,
  runtimeEdges
}: {
  node: RuntimeNodeItemType;
  runtimeEdges: RuntimeEdgeItemType[];
}) => {
  /*
    区分普通连线和递归连线
    递归连线：可以通过往上查询 nodes，最终追溯到自身
  */
  const splitEdges2WorkflowEdges = ({
    sourceEdges,
    allEdges,
    currentNode
  }: {
    sourceEdges: RuntimeEdgeItemType[];
    allEdges: RuntimeEdgeItemType[];
    currentNode: RuntimeNodeItemType;
  }) => {
    const commonEdges: RuntimeEdgeItemType[] = [];
    const recursiveEdges: RuntimeEdgeItemType[] = [];

    const checkIsCircular = (edge: RuntimeEdgeItemType, visited: Set<string>): boolean => {
      if (edge.source === currentNode.nodeId) {
        return true; // 检测到环,并且环中包含当前节点
      }
      if (visited.has(edge.source)) {
        return false; // 检测到环,但不包含当前节点(子节点成环)
      }
      visited.add(edge.source);

      // 递归检测后面的 edge，如果有其中一个成环，则返回 true
      const nextEdges = allEdges.filter((item) => item.target === edge.source);
      return nextEdges.some((nextEdge) => checkIsCircular(nextEdge, new Set(visited)));
    };

    sourceEdges.forEach((edge) => {
      if (checkIsCircular(edge, new Set([currentNode.nodeId]))) {
        recursiveEdges.push(edge);
      } else {
        commonEdges.push(edge);
      }
    });

    return { commonEdges, recursiveEdges };
  };

  const runtimeNodeSourceEdge = filterWorkflowEdges(runtimeEdges).filter(
    (item) => item.target === node.nodeId
  );

  // Entry
  if (runtimeNodeSourceEdge.length === 0) {
    return 'run';
  }

  // Classify edges
  const { commonEdges, recursiveEdges } = splitEdges2WorkflowEdges({
    sourceEdges: runtimeNodeSourceEdge,
    allEdges: runtimeEdges,
    currentNode: node
  });

  // check active（其中一组边，至少有一个 active，且没有 waiting 即可运行）
  if (
    commonEdges.length > 0 &&
    commonEdges.some((item) => item.status === 'active') &&
    commonEdges.every((item) => item.status !== 'waiting')
  ) {
    return 'run';
  }
  if (
    recursiveEdges.length > 0 &&
    recursiveEdges.some((item) => item.status === 'active') &&
    recursiveEdges.every((item) => item.status !== 'waiting')
  ) {
    return 'run';
  }

  // check skip（其中一组边，全是 skiped 则跳过运行）
  if (commonEdges.length > 0 && commonEdges.every((item) => item.status === 'skipped')) {
    return 'skip';
  }
  if (recursiveEdges.length > 0 && recursiveEdges.every((item) => item.status === 'skipped')) {
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
  variables
}: {
  text: any;
  nodes: RuntimeNodeItemType[];
  variables: Record<string, any>; // global variables
}) {
  if (typeof text !== 'string') return text;

  text = replaceVariable(text, variables);

  const variablePattern = /\{\{\$([^.]+)\.([^$]+)\$\}\}/g;
  const matches = [...text.matchAll(variablePattern)];
  if (matches.length === 0) return text;

  matches.forEach((match) => {
    const nodeId = match[1];
    const id = match[2];

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

    const formatVal = valToStr(variableVal);

    const regex = new RegExp(`\\{\\{\\$(${nodeId}\\.${id})\\$\\}\\}`, 'g');
    text = text.replace(regex, () => formatVal);
  });

  return text || '';
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
