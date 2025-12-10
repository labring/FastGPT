import { createContext } from 'use-context-selector';
import type {
  FlowNodeTemplateType,
  FlowNodeItemType,
  StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node';

import { useDeepCompareEffect, useMemoizedFn } from 'ahooks';
import React, {
  type Dispatch,
  type SetStateAction,
  type ReactNode,
  useMemo,
  useRef,
  useCallback
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
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getWebLLMModel } from '@/web/common/system/utils';

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

export type WorkflowNodeDataType = {
  selectedNodesMap: Record<string, boolean>;
};
export const WorkflowNodeDataContext = createContext<WorkflowNodeDataType>({
  selectedNodesMap: {}
});

export type WorkflowDataContextType = {
  basicNodeTemplates: FlowNodeTemplateType[];
  workflowStartNode: FlowNodeItemType | undefined;
  systemConfigNode: StoreNodeItemType | undefined;
  allNodeFolded: boolean;
  hasToolNode: boolean;
  toolNodesMap: Record<string, boolean>;
  nodeIds: string[];
  nodeAmount: number;
  foldedNodesMap: Record<string, boolean>;
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
  llmMaxQuoteContext: number;
};
export const WorkflowBufferDataContext = createContext<WorkflowDataContextType>({
  basicNodeTemplates: [],
  workflowStartNode: undefined,
  systemConfigNode: undefined,
  allNodeFolded: false,
  hasToolNode: false,
  toolNodesMap: {},
  nodeIds: [],
  nodeAmount: 0,
  foldedNodesMap: {},
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
  forbiddenSaveSnapshot: { current: false },
  llmMaxQuoteContext: 0
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
    const nodeIds: string[] = [];
    const nodeList: FlowNodeItemType[] = [];
    const nodesMap: Record<string, FlowNodeItemType> = {};
    const selectedNodesMap: Record<string, boolean> = {};
    const foldedNodesMap: Record<string, boolean> = {};
    const compareNodeList: any[] = [];
    let workflowStartNode: FlowNodeItemType | undefined = undefined;
    let systemConfigNode: StoreNodeItemType | undefined = undefined;
    let allNodeFolded = true;
    let hasToolNode = false;
    let llmMaxQuoteContext = 0;

    nodes.forEach((node) => {
      const flowNodeType = node.data.flowNodeType;

      nodeIds.push(node.data.nodeId);
      nodeList.push(node.data);
      nodesMap[node.data.nodeId] = node.data;
      compareNodeList.push({
        nodeId: node.data.nodeId,
        name: node.data.name,
        parentNodeId: node.data.parentNodeId,
        flowNodeType: node.data.flowNodeType,
        version: node.data.version,
        versionLabel: node.data.versionLabel,
        isLatestVersion: node.data.isLatestVersion,
        isFolded: node.data.isFolded,
        inputs: node.data.inputs.map((input) => {
          return {
            key: input.key,
            label: input.label,
            valueType: input.valueType
          };
        }),
        outputs: node.data.outputs.map((output) => {
          return {
            key: output.key,
            label: output.label,
            valueType: output.valueType
          };
        })
      });

      if (node.selected) {
        selectedNodesMap[node.data.nodeId] = true;
      }
      if (node.data.isFolded) {
        foldedNodesMap[node.data.nodeId] = true;
      }

      if (flowNodeType === FlowNodeTypeEnum.workflowStart) {
        workflowStartNode = node.data;
      }
      if (flowNodeType === FlowNodeTypeEnum.systemConfig) {
        systemConfigNode = node.data;
      }
      // Max context computed
      const map: Record<string, boolean> = {
        [FlowNodeTypeEnum.chatNode]: true,
        [FlowNodeTypeEnum.agent]: true
      };
      if (map[flowNodeType]) {
        const model =
          node.data.inputs.find((item) => item.key === NodeInputKeyEnum.aiModel)?.value || '';
        const quoteMaxToken = getWebLLMModel(model)?.quoteMaxToken || 0;
        llmMaxQuoteContext = Math.max(llmMaxQuoteContext, quoteMaxToken);
      }

      if (!node.data.isFolded) {
        allNodeFolded = false;
      }

      if (flowNodeType === FlowNodeTypeEnum.agent) {
        hasToolNode = true;
      }
    });

    return {
      nodeIds,
      nodeList,
      nodesMap,
      selectedNodesMap,
      workflowStartNode,
      systemConfigNode,
      allNodeFolded,
      hasToolNode,
      llmMaxQuoteContext,
      foldedNodesMap,
      compareNodeList
    };
  }, [nodes]);

  // 拆解出常用的数据，避免重复计算
  const nodeIds = useMemoEnhance(() => nodeFormat.nodeIds, [nodeFormat.nodeIds]);
  const nodeList = useMemoEnhance(() => nodeFormat.nodeList, [nodeFormat.nodeList]);
  const nodesMap = useMemoEnhance(() => nodeFormat.nodesMap, [nodeFormat.nodesMap]);
  const compareNodeList = useMemoEnhance(
    () => nodeFormat.compareNodeList,
    [nodeFormat.compareNodeList]
  );
  const selectedNodesMap = useMemoEnhance(
    () => nodeFormat.selectedNodesMap,
    [nodeFormat.selectedNodesMap]
  );
  const workflowStartNode = useMemoEnhance(
    () => nodeFormat.workflowStartNode,
    [nodeFormat.workflowStartNode]
  );
  const systemConfigNode = useMemoEnhance(
    () => nodeFormat.systemConfigNode,
    [nodeFormat.systemConfigNode]
  );
  const foldedNodesMap = useMemoEnhance(
    () => nodeFormat.foldedNodesMap,
    [nodeFormat.foldedNodesMap]
  );
  const allNodeFolded = nodeFormat.allNodeFolded;
  const hasToolNode = nodeFormat.hasToolNode;
  const llmMaxQuoteContext = nodeFormat.llmMaxQuoteContext;

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
    [compareNodeList]
  );

  const rawNodeFormat = useMemo(() => {
    const rawNodesMap: Record<string, Node<FlowNodeItemType, string | undefined>> = {};

    nodes.forEach((node) => {
      rawNodesMap[node.id] = node;
    });

    return {
      rawNodesMap
    };
  }, [nodes]);
  const rawNodesMap = useMemoEnhance(() => rawNodeFormat.rawNodesMap, [rawNodeFormat]);
  const getRawNodeById = useMemoizedFn((nodeId: string | null | undefined) => {
    return nodeId ? rawNodesMap[nodeId] : undefined;
  });

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

  // Snapshot blocking flag
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

  // 数据Context - 只包含 原始nodes
  const rawNodeContextValue = useMemo(
    () => ({
      nodes,
      rawNodesMap,
      getRawNodeById
    }),
    [nodes, rawNodesMap, getRawNodeById]
  );

  const nodeDataContextValue = useMemoEnhance(() => {
    console.log('WoworkflowNodeDataContextValue 更新了');
    return {
      selectedNodesMap
    };
  }, [selectedNodesMap]);

  const workflowBufferDataContextValue = useMemoEnhance(() => {
    console.log('WoworkflowBufferDataContextValue 更新了');
    return {
      nodeIds,
      basicNodeTemplates,
      workflowStartNode,
      systemConfigNode,
      allNodeFolded,
      hasToolNode,
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
      llmMaxQuoteContext,
      nodeAmount: nodeList.length
    };
  }, [
    nodeIds,
    basicNodeTemplates,
    workflowStartNode,
    systemConfigNode,
    allNodeFolded,
    hasToolNode,
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
    llmMaxQuoteContext,
    nodeList.length
  ]);

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
