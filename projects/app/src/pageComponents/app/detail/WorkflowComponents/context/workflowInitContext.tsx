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
};
export const WorkflowInitContext = createContext<WorkflowNodeContextType>({
  nodes: []
});

export type WorkflowDataContextType = {
  basicNodeTemplates: FlowNodeTemplateType[];
  workflowStartNode: FlowNodeItemType | undefined;
  nodeList: FlowNodeItemType[];
  toolNodesMap: Record<string, boolean>;
  getNodeById: (
    nodeId: string | null | undefined,
    condition?: (node: FlowNodeItemType) => boolean
  ) => FlowNodeItemType | undefined;
  setNodes: Dispatch<SetStateAction<Node<FlowNodeItemType, string | undefined>[]>>;
  onNodesChange: OnChange<NodeChange>;
  getNodes: () => Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
  setEdges: Dispatch<SetStateAction<Edge<any>[]>>;
  onEdgesChange: OnChange<EdgeChange>;
  forbiddenSaveSnapshot: React.MutableRefObject<boolean>;
};
export const WorkflowDataContext = createContext<WorkflowDataContextType>({
  basicNodeTemplates: [],
  workflowStartNode: undefined,
  nodeList: [],
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
    let workflowStartNode: FlowNodeItemType | undefined = undefined;

    nodes.forEach((node) => {
      nodeList.push(node.data);
      nodesMap[node.data.nodeId] = node.data;

      if (node.data.flowNodeType === FlowNodeTypeEnum.workflowStart) {
        workflowStartNode = node.data;
      }
    });

    return { nodeList, nodesMap, workflowStartNode };
  }, [nodes]);
  const nodeList = useMemoEnhance(() => nodeFormat.nodeList, [nodeFormat]);
  const nodesMap = useMemoEnhance(() => nodeFormat.nodesMap, [nodeFormat]);
  const workflowStartNode = useMemoEnhance(() => nodeFormat.workflowStartNode, [nodeFormat]);

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

  useEffect(() => {
    console.log(121212);
  }, [nodeList]);

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
      nodes
    }),
    [nodes]
  );

  const workflowDataContextValue = useMemoEnhance(() => {
    return {
      basicNodeTemplates,
      workflowStartNode,
      nodeList,
      nodesMap,
      toolNodesMap,
      getNodeById,
      setNodes,
      onNodesChange,
      getNodes,
      edges,
      setEdges,
      onEdgesChange,
      forbiddenSaveSnapshot
    };
  }, [
    setNodes,
    nodeList,
    toolNodesMap,
    getNodeById,
    edges,
    onNodesChange,
    getNodes,
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
