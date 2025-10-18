import { createContext } from 'use-context-selector';
import {
  type FlowNodeTemplateType,
  type FlowNodeItemType
} from '@fastgpt/global/core/workflow/type/node';

import { useDeepCompareEffect, useMemoizedFn } from 'ahooks';
import React, {
  type Dispatch,
  type SetStateAction,
  type ReactNode,
  useMemo,
  useCallback,
  useRef,
  useEffect
} from 'react';
import {
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  useEdgesState,
  useNodesState
} from 'reactflow';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

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
  getRawNodeById: function (
    nodeId: string | null | undefined
  ): Node<FlowNodeItemType, string | undefined> | undefined {
    throw new Error('Function not implemented.');
  }
});

export type WorkflowDataContextType = {
  basicNodeTemplates: FlowNodeTemplateType[];
  workflowStartNode: FlowNodeItemType | undefined;
  selectedNodesMap: Record<string, boolean>;
  nodeList: FlowNodeItemType[];
  allNodeFolded: boolean;
  hasToolNode: boolean;
  toolNodesMap: Record<string, boolean>;
  getNodeById: (
    nodeId: string | null | undefined,
    condition?: (node: FlowNodeItemType) => boolean
  ) => FlowNodeItemType | undefined;
  setNodes: Dispatch<SetStateAction<Node<FlowNodeItemType, string | undefined>[]>>;
  onNodesChange: OnChange<NodeChange>;
  getNodes: () => Node<FlowNodeItemType, string | undefined>[];
  getNodeList: () => FlowNodeItemType[];
  edges: Edge<any>[];
  setEdges: Dispatch<SetStateAction<Edge<any>[]>>;
  onEdgesChange: OnChange<EdgeChange>;
  forbiddenSaveSnapshot: React.MutableRefObject<boolean>;
};
export const WorkflowDataContext = createContext<WorkflowDataContextType>({
  basicNodeTemplates: [],
  workflowStartNode: undefined,
  selectedNodesMap: {},
  nodeList: [],
  allNodeFolded: false,
  hasToolNode: false,
  toolNodesMap: {},
  getNodeById: function (nodeId: string | null | undefined): FlowNodeItemType | undefined {
    throw new Error('Function not implemented.');
  },
  setNodes: function (
    value: React.SetStateAction<Node<FlowNodeItemType, string | undefined>[]>
  ): void {
    throw new Error('Function not implemented.');
  },
  onNodesChange: function (changes: NodeChange[]): void {
    throw new Error('Function not implemented.');
  },
  getNodes: function (): Node<FlowNodeItemType, string | undefined>[] {
    throw new Error('Function not implemented.');
  },
  getNodeList: function (): FlowNodeItemType[] {
    throw new Error('Function not implemented.');
  },
  edges: [],
  setEdges: function (value: React.SetStateAction<Edge<any>[]>): void {
    throw new Error('Function not implemented.');
  },
  onEdgesChange: function (changes: EdgeChange[]): void {
    throw new Error('Function not implemented.');
  },
  forbiddenSaveSnapshot: { current: false }
});

const WorkflowInitContextProvider = ({
  children,
  basicNodeTemplates
}: {
  children: ReactNode;
  basicNodeTemplates: FlowNodeTemplateType[];
}) => {
  // Nodes
  const [nodes = [], setNodes, onNodesChange] = useNodesState<FlowNodeItemType>([]);
  const getNodes = useMemoizedFn(() => nodes);

  const nodeFormat = useMemo(() => {
    const nodeList: FlowNodeItemType[] = [];
    const nodesMap: Record<string, FlowNodeItemType> = {};
    const selectedNodesMap: Record<string, boolean> = {};
    let workflowStartNode: FlowNodeItemType | undefined = undefined;
    let allNodeFolded = true;
    let hasToolNode = false;

    nodes.forEach((node) => {
      nodeList.push(node.data);
      nodesMap[node.data.nodeId] = node.data;

      if (node.selected) {
        selectedNodesMap[node.data.nodeId] = true;
      }

      if (node.data.flowNodeType === FlowNodeTypeEnum.workflowStart) {
        workflowStartNode = node.data;
      }

      if (!node.data.isFolded) {
        allNodeFolded = false;
      }

      if (node.data.flowNodeType === FlowNodeTypeEnum.agent) {
        hasToolNode = true;
      }
    });

    return {
      nodeList,
      nodesMap,
      selectedNodesMap,
      workflowStartNode,
      allNodeFolded,
      hasToolNode
    };
  }, [nodes]);
  const nodeList = useMemoEnhance(() => nodeFormat.nodeList, [nodeFormat]);
  const nodesMap = useMemoEnhance(() => nodeFormat.nodesMap, [nodeFormat]);
  const selectedNodesMap = useMemoEnhance(() => nodeFormat.selectedNodesMap, [nodeFormat]);
  const workflowStartNode = useMemoEnhance(() => nodeFormat.workflowStartNode, [nodeFormat]);
  const allNodeFolded = nodeFormat.allNodeFolded;
  const hasToolNode = nodeFormat.hasToolNode;

  const getNodeList = useCallback(() => nodeList, [nodeList]);
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

  const rawNodesMap = useMemoEnhance(
    () =>
      nodes.reduce(
        (acc, node) => {
          acc[node.id] = node;
          return acc;
        },
        {} as Record<string, Node<FlowNodeItemType, string | undefined>>
      ),
    [nodes]
  );
  const getRawNodeById = useCallback(
    (nodeId: string | null | undefined) => {
      return nodeId ? rawNodesMap[nodeId] : undefined;
    },
    [rawNodesMap]
  );

  // Edges
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const toolNodesMap = useMemoEnhance(() => {
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

  // 快照阻塞标志
  const forbiddenSaveSnapshot = useRef(false);

  // Elevate childNodes
  useDeepCompareEffect(() => {
    setNodes((nodes) =>
      nodes.map((node) => (node.data.parentNodeId ? { ...node, zIndex: 1001 } : node))
    );
  }, [nodeList]);

  // Elevate edges of childNodes - 使用nodesMap优化O(n)查找为O(1)
  useDeepCompareEffect(() => {
    setEdges((state) =>
      state.map((item) => {
        const sourceNode = nodesMap[item.source];
        return sourceNode?.parentNodeId ? { ...item, zIndex: 1001 } : item;
      })
    );
  }, [nodesMap, edges.length, setEdges]);

  // 数据Context - 只包含数据
  const nodeContextValue = useMemo(
    () => ({
      nodes,
      rawNodesMap,
      getRawNodeById
    }),
    [nodes, rawNodesMap, getRawNodeById]
  );

  const workflowDataContextValue = useMemoEnhance(() => {
    return {
      basicNodeTemplates,
      workflowStartNode,
      selectedNodesMap,
      nodeList,
      allNodeFolded,
      hasToolNode,
      nodesMap,
      toolNodesMap,
      getNodeById,
      setNodes,
      onNodesChange,
      getNodes,
      getNodeList,
      edges,
      setEdges,
      onEdgesChange,
      forbiddenSaveSnapshot
    };
  }, [
    setNodes,
    selectedNodesMap,
    nodeList,
    allNodeFolded,
    hasToolNode,
    toolNodesMap,
    getNodeById,
    edges,
    onNodesChange,
    getNodes,
    getNodeList,
    setEdges,
    onEdgesChange,
    forbiddenSaveSnapshot
  ]);

  return (
    <WorkflowInitContext.Provider value={nodeContextValue}>
      <WorkflowDataContext.Provider value={workflowDataContextValue}>
        {children}
      </WorkflowDataContext.Provider>
    </WorkflowInitContext.Provider>
  );
};

export default WorkflowInitContextProvider;
