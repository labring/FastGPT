import { ChatCompletionRequestMessageRoleEnum } from '../../ai/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '../constants';
import { FlowNodeTypeEnum } from '../node/constant';
import { StoreNodeItemType } from '../type';
import { StoreEdgeItemType } from '../type/edge';
import { RuntimeEdgeItemType, RuntimeNodeItemType } from './type';
import { VARIABLE_NODE_ID } from '../constants';
import { isReferenceValue } from '../utils';
import { ReferenceValueProps } from '../type/io';

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

export const initWorkflowEdgeStatus = (edges: StoreEdgeItemType[]): RuntimeEdgeItemType[] => {
  return (
    edges?.map((edge) => ({
      ...edge,
      status: 'waiting'
    })) || []
  );
};

export const getDefaultEntryNodeIds = (nodes: (StoreNodeItemType | RuntimeNodeItemType)[]) => {
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
        pluginId: node.pluginId
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
  区分普通连线和递归连线
  递归连线：可以通过往上查询 nodes，最终追溯到自身
*/
export const splitEdges2WorkflowEdges = ({
  edges,
  allEdges,
  currentNode
}: {
  edges: RuntimeEdgeItemType[];
  allEdges: RuntimeEdgeItemType[];
  currentNode: RuntimeNodeItemType;
}) => {
  const commonEdges: RuntimeEdgeItemType[] = [];
  const recursiveEdges: RuntimeEdgeItemType[] = [];

  edges.forEach((edge) => {
    const checkIsCurrentNode = (edge: RuntimeEdgeItemType): boolean => {
      const sourceEdge = allEdges.find((item) => item.target === edge.source);
      if (!sourceEdge) return false;
      if (sourceEdge.source === currentNode.nodeId) return true;
      return checkIsCurrentNode(sourceEdge);
    };
    if (checkIsCurrentNode(edge)) {
      recursiveEdges.push(edge);
    } else {
      commonEdges.push(edge);
    }
  });

  return { commonEdges, recursiveEdges };
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
  const workflowEdges = filterWorkflowEdges(runtimeEdges).filter(
    (item) => item.target === node.nodeId
  );

  if (workflowEdges.length === 0) {
    return 'run';
  }

  const { commonEdges, recursiveEdges } = splitEdges2WorkflowEdges({
    edges: workflowEdges,
    allEdges: runtimeEdges,
    currentNode: node
  });

  // check skip
  if (commonEdges.every((item) => item.status === 'skipped')) {
    return 'skip';
  }
  if (recursiveEdges.length > 0 && recursiveEdges.every((item) => item.status === 'skipped')) {
    return 'skip';
  }

  // check active
  if (commonEdges.every((item) => item.status !== 'waiting')) {
    return 'run';
  }
  if (recursiveEdges.length > 0 && recursiveEdges.every((item) => item.status !== 'waiting')) {
    return 'run';
  }

  return 'wait';
};

export const getReferenceVariableValue = ({
  value,
  nodes,
  variables
}: {
  value: ReferenceValueProps;
  nodes: RuntimeNodeItemType[];
  variables: Record<string, any>;
}) => {
  if (!isReferenceValue(value)) {
    return value;
  }
  const sourceNodeId = value[0];
  const outputId = value[1];

  if (sourceNodeId === VARIABLE_NODE_ID && outputId) {
    return variables[outputId];
  }

  const node = nodes.find((node) => node.nodeId === sourceNodeId);

  if (!node) {
    return undefined;
  }

  const outputValue = node.outputs.find((output) => output.id === outputId)?.value;

  return outputValue;
};

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
  return JSON.stringify({
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
  });
};
