import { createContext } from 'use-context-selector';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

import { useMemoizedFn } from 'ahooks';
import React, { Dispatch, SetStateAction, ReactNode, useEffect, useMemo } from 'react';
import { Edge, EdgeChange, Node, NodeChange, useEdgesState, useNodesState } from 'reactflow';

type OnChange<ChangesType> = (changes: ChangesType[]) => void;

type WorkflowInitContextType = {
  nodes: Node<FlowNodeItemType, string | undefined>[];
};
export const WorkflowInitContext = createContext<WorkflowInitContextType>({
  nodes: []
});

type WorkflowActionContextType = {
  setNodes: Dispatch<SetStateAction<Node<FlowNodeItemType, string | undefined>[]>>;
  onNodesChange: OnChange<NodeChange>;
  getNodes: () => Node<FlowNodeItemType, string | undefined>[];
  nodeListString: string;
  edges: Edge<any>[];
  setEdges: Dispatch<SetStateAction<Edge<any>[]>>;
  onEdgesChange: OnChange<EdgeChange>;
};
export const WorkflowNodeEdgeContext = createContext<WorkflowActionContextType>({
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
  nodeListString: JSON.stringify([]),
  edges: [],
  setEdges: function (value: React.SetStateAction<Edge<any>[]>): void {
    throw new Error('Function not implemented.');
  },
  onEdgesChange: function (changes: EdgeChange[]): void {
    throw new Error('Function not implemented.');
  }
});

const WorkflowInitContextProvider = ({ children }: { children: ReactNode }) => {
  // Nodes
  const [nodes = [], setNodes, onNodesChange] = useNodesState<FlowNodeItemType>([]);
  const getNodes = useMemoizedFn(() => nodes);
  const nodeListString = JSON.stringify(nodes.map((node) => node.data));
  const nodeList = useMemo(
    () => JSON.parse(nodeListString) as FlowNodeItemType[],
    [nodeListString]
  );

  // Edges
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Elevate childNodes
  useEffect(() => {
    setNodes((nodes) =>
      nodes.map((node) => (node.data.parentNodeId ? { ...node, zIndex: 1001 } : node))
    );
  }, [nodeList]);
  // Elevate edges of childNodes
  useEffect(() => {
    setEdges((state) =>
      state.map((item) =>
        nodeList.some((node) => item.source === node.nodeId && node.parentNodeId)
          ? { ...item, zIndex: 1001 }
          : item
      )
    );
  }, [edges.length]);

  const actionContextValue = useMemo(
    () => ({
      setNodes,
      onNodesChange,
      getNodes,
      nodeListString,

      edges,
      setEdges,
      onEdgesChange
    }),
    [setNodes, onNodesChange, getNodes, nodeListString, edges, setEdges, onEdgesChange]
  );

  return (
    <WorkflowInitContext.Provider
      value={{
        nodes
      }}
    >
      <WorkflowNodeEdgeContext.Provider value={actionContextValue}>
        {children}
      </WorkflowNodeEdgeContext.Provider>
    </WorkflowInitContext.Provider>
  );
};

export default WorkflowInitContextProvider;
