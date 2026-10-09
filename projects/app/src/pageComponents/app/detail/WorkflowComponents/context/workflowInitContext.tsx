import type {
  FlowNodeItemType,
  FlowNodeTemplateType
} from '@fastgpt/global/core/workflow/type/node';
import { createContext } from 'use-context-selector';

import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useMemoizedFn } from 'ahooks';
import React, {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useMemo,
  useEffect
} from 'react';
import { type Edge, type EdgeChange, type Node, type NodeChange } from '@xyflow/react';
import { useWorkflowStore } from '../store/useWorkflowStore';

type OnChange<ChangesType> = (changes: ChangesType[]) => void;

type WorkflowNodeContextType = {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  rawNodesMap: Record<string, Node<FlowNodeItemType, string | undefined>>;
  getRawNodeById: (
    nodeId: string | null | undefined
  ) => Node<FlowNodeItemType, string | undefined> | undefined;
};
export const WorkflowInitContext = createContext<WorkflowNodeContextType>({
  nodes: [],
  rawNodesMap: {},
  getRawNodeById: () => undefined
});

export type WorkflowNodeDataType = {
  selectedNodesMap: Record<string, boolean>;
};
export const WorkflowNodeDataContext = createContext<WorkflowNodeDataType>({
  selectedNodesMap: {}
});

export type WorkflowDataContextType = {
  basicNodeTemplates: FlowNodeTemplateType[];
  workflowStartNode: FlowNodeItemType | undefined;
  allNodeFolded: boolean;
  hasToolNode: boolean;
  hasLoopRunNode: boolean;
  toolNodesMap: Record<string, boolean>;
  nodeIds: string[];
  nodeAmount: number;
  foldedNodesMap: Record<string, boolean>;
  getNodeById: (
    nodeId: string | null | undefined,
    condition?: (node: FlowNodeItemType) => boolean
  ) => FlowNodeItemType | undefined;
  setNodes: Dispatch<SetStateAction<Node<FlowNodeItemType, string | undefined>[]>>;
  onNodesChange: OnChange<NodeChange<Node<FlowNodeItemType>>>;
  getNodes: () => Node<FlowNodeItemType, string | undefined>[];
  getNodeList: () => FlowNodeItemType[];
  edges: Edge[];
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  onEdgesChange: OnChange<EdgeChange>;
  forbiddenSaveSnapshot: React.MutableRefObject<boolean>;

  childrenNodeIdListMap: Record<string, string[]>;
};
export const WorkflowBufferDataContext = createContext<WorkflowDataContextType>({
  basicNodeTemplates: [],
  workflowStartNode: undefined,
  allNodeFolded: false,
  hasToolNode: false,
  hasLoopRunNode: false,
  toolNodesMap: {},
  nodeIds: [],
  nodeAmount: 0,
  foldedNodesMap: {},
  getNodeById: () => undefined,
  setNodes: () => {},
  onNodesChange: () => {},
  getNodes: () => [],
  getNodeList: () => [],
  edges: [],
  setEdges: () => {},
  onEdgesChange: () => {},
  forbiddenSaveSnapshot: { current: false },

  childrenNodeIdListMap: {}
});

const WorkflowInitContextProvider = ({
  children,
  basicNodeTemplates
}: {
  children: ReactNode;
  basicNodeTemplates: FlowNodeTemplateType[];
}) => {
  // Connect to Zustand store
  const nodes = useWorkflowStore((s) => s.nodes);
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const getNodes = useWorkflowStore((s) => s.getNodes);

  const edges = useWorkflowStore((s) => s.edges);
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const forbiddenSaveSnapshot = useWorkflowStore((s) => s.forbiddenSaveSnapshot);

  useEffect(() => {
    useWorkflowStore.getState().initWorkflowStore({ basicNodeTemplates });
  }, [basicNodeTemplates]);

  useEffect(() => {
    return () => {
      useWorkflowStore.getState().resetWorkflowStore();
    };
  }, []);

  const {
    nodeIds,
    nodeList,
    nodesMap,
    rawNodesMap,
    childrenNodeIdListMap,
    selectedNodesMap,
    workflowStartNode,
    allNodeFolded,
    hasToolNode,
    hasLoopRunNode,
    foldedNodesMap
  } = useMemo(() => {
    const nodeIds: string[] = [];
    const nodeList: FlowNodeItemType[] = [];
    const nodesMap: Record<string, FlowNodeItemType> = {};
    const rawNodesMap: Record<string, Node<FlowNodeItemType>> = {};
    const childrenNodeIdListMap: Record<string, string[]> = {};
    const selectedNodesMap: Record<string, boolean> = {};
    const foldedNodesMap: Record<string, boolean> = {};
    let workflowStartNode: FlowNodeItemType | undefined = undefined;
    let allNodeFolded = true;
    let hasToolNode = false;
    let hasLoopRunNode = false;

    nodes.forEach((node) => {
      const flowNodeType = node.data.flowNodeType;

      nodeIds.push(node.data.nodeId);
      nodeList.push(node.data);
      nodesMap[node.data.nodeId] = node.data;
      rawNodesMap[node.id] = node;

      const parentId = node.data.parentNodeId;
      if (parentId) {
        if (!childrenNodeIdListMap[parentId]) {
          childrenNodeIdListMap[parentId] = [];
        }
        childrenNodeIdListMap[parentId].push(node.data.nodeId);
      }

      if (node.selected) {
        selectedNodesMap[node.data.nodeId] = true;
      }
      if (node.data.isFolded) {
        foldedNodesMap[node.data.nodeId] = true;
      }

      if (flowNodeType === FlowNodeTypeEnum.workflowStart) {
        workflowStartNode = node.data;
      }
      if (!node.data.isFolded && flowNodeType !== FlowNodeTypeEnum.comment) {
        allNodeFolded = false;
      }

      if (flowNodeType === FlowNodeTypeEnum.toolCall) {
        hasToolNode = true;
      }
      if (flowNodeType === FlowNodeTypeEnum.loopRun) {
        hasLoopRunNode = true;
      }
    });

    return {
      nodeIds,
      nodeList,
      nodesMap,
      rawNodesMap,
      childrenNodeIdListMap,
      selectedNodesMap,
      workflowStartNode,
      allNodeFolded,
      hasToolNode,
      hasLoopRunNode,
      foldedNodesMap
    };
  }, [nodes]);

  const getNodeList = useMemoizedFn(() => nodeList);

  const getNodeById = useCallback(
    (nodeId: string | null | undefined, condition?: (node: FlowNodeItemType) => boolean) => {
      if (!nodeId) return undefined;
      const node = nodesMap[nodeId];
      if (node) {
        if (condition) {
          return condition(node) ? node : undefined;
        }
        return node;
      }

      return undefined;
    },
    [nodesMap]
  );

  const getRawNodeById = useMemoizedFn((nodeId: string | null | undefined) => {
    return nodeId ? rawNodesMap[nodeId] : undefined;
  });

  const toolNodesMap = useMemo(() => {
    const selectedToolEdgeMap: Record<string, boolean> = {};
    edges.forEach((edge) => {
      if (edge.targetHandle === NodeOutputKeyEnum.selectedTools) {
        selectedToolEdgeMap[edge.target] = true;
      }
    });

    return nodeList.reduce(
      (acc, node) => {
        if (selectedToolEdgeMap[node.nodeId]) {
          acc[node.nodeId] = true;
        }
        return acc;
      },
      {} as Record<string, boolean>
    );
  }, [nodeList, edges]);

  // 数据Context - 只包含 原始nodes
  const rawNodeContextValue = useMemo(
    () => ({
      nodes,
      rawNodesMap,
      getRawNodeById
    }),
    [nodes, rawNodesMap, getRawNodeById]
  );

  const nodeDataContextValue = useMemo(
    () => ({
      selectedNodesMap
    }),
    [selectedNodesMap]
  );

  const workflowBufferDataContextValue = useMemo(
    () => ({
      nodeIds,
      basicNodeTemplates,
      workflowStartNode,
      allNodeFolded,
      hasToolNode,
      hasLoopRunNode,
      toolNodesMap,
      foldedNodesMap,
      getNodeById,
      setNodes,
      onNodesChange,
      getNodes,
      getNodeList,
      edges,
      setEdges,
      onEdgesChange,
      forbiddenSaveSnapshot,
      nodeAmount: nodeList.length,
      childrenNodeIdListMap
    }),
    [
      nodeIds,
      basicNodeTemplates,
      workflowStartNode,
      allNodeFolded,
      hasToolNode,
      hasLoopRunNode,
      toolNodesMap,
      foldedNodesMap,
      getNodeById,
      setNodes,
      onNodesChange,
      getNodes,
      getNodeList,
      edges,
      setEdges,
      onEdgesChange,
      forbiddenSaveSnapshot,
      nodeList.length,
      childrenNodeIdListMap
    ]
  );

  return (
    <WorkflowInitContext.Provider value={rawNodeContextValue}>
      <WorkflowNodeDataContext.Provider value={nodeDataContextValue}>
        <WorkflowBufferDataContext.Provider value={workflowBufferDataContextValue}>
          {children}
        </WorkflowBufferDataContext.Provider>
      </WorkflowNodeDataContext.Provider>
    </WorkflowInitContext.Provider>
  );
};

export default WorkflowInitContextProvider;
