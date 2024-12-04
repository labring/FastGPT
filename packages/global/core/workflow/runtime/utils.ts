import { ChatCompletionRequestMessageRoleEnum } from '../../ai/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '../constants';
import { FlowNodeTypeEnum } from '../node/constant';
import { StoreNodeItemType } from '../type/node';
import { StoreEdgeItemType } from '../type/edge';
import { RuntimeEdgeItemType, RuntimeNodeItemType } from './type';
import { VARIABLE_NODE_ID } from '../constants';
import { isValidReferenceValueFormat } from '../utils';
import { FlowNodeOutputItemType, ReferenceValueType } from '../type/io';
import { ChatItemType, NodeOutputItemType } from '../../../core/chat/type';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '../../../core/chat/constants';

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

/* 
  Get interaction information (if any) from the last AI message.
  What can be done:
  1. Get the interactive data
  2. Check that the workflow starts at the interaction node
*/
export const getLastInteractiveValue = (histories: ChatItemType[]) => {
  const lastAIMessage = [...histories].reverse().find((item) => item.obj === ChatRoleEnum.AI);

  if (lastAIMessage) {
    const lastValue = lastAIMessage.value[lastAIMessage.value.length - 1];

    if (
      !lastValue ||
      lastValue.type !== ChatItemValueTypeEnum.interactive ||
      !lastValue.interactive
    ) {
      return null;
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

  return null;
};

export const initWorkflowEdgeStatus = (
  edges: StoreEdgeItemType[],
  histories?: ChatItemType[]
): RuntimeEdgeItemType[] => {
  // If there is a history, use the last interactive value
  if (histories && histories.length > 0) {
    const memoryEdges = getLastInteractiveValue(histories)?.memoryEdges;

    if (memoryEdges && memoryEdges.length > 0) {
      return memoryEdges;
    }
  }

  return (
    edges?.map((edge) => ({
      ...edge,
      status: 'waiting'
    })) || []
  );
};

export const getWorkflowEntryNodeIds = (
  nodes: (StoreNodeItemType | RuntimeNodeItemType)[],
  histories?: ChatItemType[]
) => {
  // If there is a history, use the last interactive entry node
  if (histories && histories.length > 0) {
    const entryNodeIds = getLastInteractiveValue(histories)?.entryNodeIds;

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
    .filter((node) => entryList.includes(node.flowNodeType as any))
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
        version: node.version
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

  // check skip（其中一组边，全 skip）
  if (commonEdges.length > 0 && commonEdges.every((item) => item.status === 'skipped')) {
    return 'skip';
  }
  if (recursiveEdges.length > 0 && recursiveEdges.every((item) => item.status === 'skipped')) {
    return 'skip';
  }

  // check active（有一类边，不全是 wait 即可运行）
  if (commonEdges.length > 0 && commonEdges.every((item) => item.status !== 'waiting')) {
    return 'run';
  }
  if (recursiveEdges.length > 0 && recursiveEdges.every((item) => item.status !== 'waiting')) {
    return 'run';
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
      if (output) return output.value;

      const input = node.inputs.find((input) => input.key === id);
      if (input) return getReferenceVariableValue({ value: input.value, nodes, variables });
    })();

    const formatVal = (() => {
      if (variableVal === undefined) return 'undefined';
      if (variableVal === null) return 'null';
      return typeof variableVal === 'object' ? JSON.stringify(variableVal) : String(variableVal);
    })();

    const regex = new RegExp(`\\{\\{\\$(${nodeId}\\.${id})\\$\\}\\}`, 'g');
    text = text.replace(regex, formatVal);
  });

  return text || '';
}

export const textAdaptGptResponse = ({
  text,
  model = '',
  finish_reason = null,
  extraData = {}
}: {
  model?: string;
  text: string | null;
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
        delta:
          text === null
            ? {}
            : { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: text },
        index: 0,
        finish_reason
      }
    ]
  };
};

/* Update runtimeNode's outputs with interactive data from history */
export function rewriteNodeOutputByHistories(
  histories: ChatItemType[],
  runtimeNodes: RuntimeNodeItemType[]
) {
  const interactive = getLastInteractiveValue(histories);
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
