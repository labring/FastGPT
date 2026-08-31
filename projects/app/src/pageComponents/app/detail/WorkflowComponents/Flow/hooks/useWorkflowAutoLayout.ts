import { useCallback, useEffect, useRef, useState } from 'react';
import { cloneDeep } from 'lodash-es';
import dagre from '@dagrejs/dagre';
import { type Edge, type Node, useNodes, useNodesInitialized, useReactFlow } from 'reactflow';
import { useContextSelector } from 'use-context-selector';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { WorkflowBufferDataContext } from '../../context/workflowInitContext';
import { WorkflowLayoutContext } from '../../context/workflowComputeContext';
import { getHandleIndex } from '../utils/edge';

const defaultNodeWidth = 420;
const defaultNodeHeight = 240;
const autoLayoutInitializationTimeoutMs = 5000;
const autoLayoutStableSizeFrameCount = 2;

export type WorkflowAutoLayoutResult = 'applied' | 'degraded' | 'failed';

type PendingAutoLayoutRequest = {
  nodeIds: Set<string>;
  workflowDataRevision: number;
  resolve: (result: WorkflowAutoLayoutResult) => void;
  running: boolean;
  timeout: ReturnType<typeof setTimeout>;
  animationFrame?: number;
  lastNodeSizeSignature?: string;
  stableNodeSizeFrames: number;
};

type LayoutOptions = {
  allowFallbackDimensions?: boolean;
  expectedNodeIds?: Set<string>;
};

type RequestAutoLayoutOptions = {
  nodeIds: string[];
  workflowDataRevision: number;
};

type MergeWorkflowLayoutNodesProps = {
  currentNodes: Node<FlowNodeItemType>[];
  layoutedNodes: Node<FlowNodeItemType>[];
  resizedNodeIds: Set<string>;
};

/** 判断当前画布是否已经完整加载了本次 Builder 应用的节点集合。 */
export const matchesWorkflowAutoLayoutRequest = ({
  nodes,
  nodeIds
}: {
  nodes: Node<FlowNodeItemType>[];
  nodeIds: Set<string>;
}) => nodes.length === nodeIds.size && nodes.every((node) => nodeIds.has(node.id));

/**
 * 生成 Builder 目标节点的完整尺寸签名。
 * 节点集合不匹配或仍有节点未完成测量时返回 undefined，避免使用不完整尺寸开始布局。
 */
export const getWorkflowAutoLayoutNodeSizeSignature = ({
  nodes,
  nodeIds
}: {
  nodes: Node<FlowNodeItemType>[];
  nodeIds: Set<string>;
}) => {
  if (!matchesWorkflowAutoLayoutRequest({ nodes, nodeIds })) return;
  if (nodes.some((node) => !node.width || !node.height)) return;

  return nodes
    .map((node) => `${node.id}:${node.width}:${node.height}`)
    .sort()
    .join('|');
};

/**
 * 将布局结果合并到画布的最新节点，只更新坐标和容器尺寸。
 *
 * 布局计算期间 Builder 导入可能已经更新节点参数，因此不能把计算开始时捕获的整份节点
 * 写回画布，否则同 ID 节点的最新业务数据会被旧快照覆盖。
 */
export const mergeWorkflowLayoutNodes = ({
  currentNodes,
  layoutedNodes,
  resizedNodeIds
}: MergeWorkflowLayoutNodesProps) => {
  const layoutedNodeMap = new Map(layoutedNodes.map((node) => [node.id, node]));

  return currentNodes.map((node) => {
    const layoutedNode = layoutedNodeMap.get(node.id);
    if (!layoutedNode) return node;

    if (!resizedNodeIds.has(node.id)) {
      return {
        ...node,
        position: layoutedNode.position
      };
    }

    const layoutInputMap = new Map(
      layoutedNode.data.inputs
        .filter(
          (input) =>
            input.key === NodeInputKeyEnum.nodeWidth || input.key === NodeInputKeyEnum.nodeHeight
        )
        .map((input) => [input.key, input.value])
    );

    return {
      ...node,
      position: layoutedNode.position,
      width: layoutedNode.width,
      height: layoutedNode.height,
      data: {
        ...node.data,
        inputs: node.data.inputs.map((input) =>
          layoutInputMap.has(input.key)
            ? {
                ...input,
                value: layoutInputMap.get(input.key)
              }
            : input
        )
      }
    };
  });
};

/**
 * 提供工作流画布统一的自动布局能力。
 * 手动对齐立即执行；Builder 对齐会等待本次导入的节点集合完成 ReactFlow 初始化。
 */
export const useWorkflowAutoLayout = () => {
  const { setNodes, workflowDataRevision } = useContextSelector(
    WorkflowBufferDataContext,
    (value) => value
  );
  const getParentNodeSizeAndPosition = useContextSelector(
    WorkflowLayoutContext,
    (value) => value.getParentNodeSizeAndPosition
  );
  const { fitView, getEdges, getNodes } = useReactFlow<FlowNodeItemType>();
  const renderedNodes = useNodes<FlowNodeItemType>();
  const nodesInitialized = useNodesInitialized();
  const pendingRequestRef = useRef<PendingAutoLayoutRequest>();
  const workflowDataRevisionRef = useRef(workflowDataRevision);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    workflowDataRevisionRef.current = workflowDataRevision;
  }, [workflowDataRevision]);

  const autoLayout = useCallback(
    async ({ allowFallbackDimensions = false, expectedNodeIds }: LayoutOptions = {}) => {
      const currentNodes = getNodes();
      if (
        currentNodes.length === 0 ||
        (expectedNodeIds &&
          !matchesWorkflowAutoLayoutRequest({ nodes: currentNodes, nodeIds: expectedNodeIds }))
      ) {
        return 'failed' as const;
      }

      let usedFallbackDimensions = false;
      const originalDimensions = new Map(
        currentNodes.map((node) => [node.id, { width: node.width, height: node.height }])
      );
      const newNodes = cloneDeep(currentNodes);

      if (allowFallbackDimensions) {
        newNodes.forEach((node) => {
          const configuredWidth = Number(
            node.data.inputs.find((input) => input.key === NodeInputKeyEnum.nodeWidth)?.value
          );
          const configuredHeight = Number(
            node.data.inputs.find((input) => input.key === NodeInputKeyEnum.nodeHeight)?.value
          );
          if (!node.width) {
            node.width = configuredWidth || defaultNodeWidth;
            usedFallbackDimensions = true;
          }
          if (!node.height) {
            node.height = configuredHeight || defaultNodeHeight;
            usedFallbackDimensions = true;
          }
        });
      }

      if (newNodes.some((node) => !node.width || !node.height)) {
        return 'failed' as const;
      }

      const edges = getEdges();
      const updateNodesPosition = ({
        startNode,
        nodes,
        edges,
        syncChildNodes
      }: {
        startNode: Node<FlowNodeItemType>;
        nodes: Node<FlowNodeItemType>[];
        edges: Edge[];
        syncChildNodes: boolean;
      }) => {
        const startPosition = { x: startNode.position.x, y: startNode.position.y };
        const childNodeIds = new Set(
          syncChildNodes
            ? nodes.filter((node) => !!node.data.parentNodeId).map((node) => node.id)
            : []
        );
        const layoutNodes = nodes.filter((node) => !childNodeIds.has(node.id));
        const layoutNodeIds = new Set(layoutNodes.map((node) => node.id));
        const layoutEdges = edges.filter(
          (edge) => layoutNodeIds.has(edge.source) && layoutNodeIds.has(edge.target)
        );
        const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
        dagreGraph.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 200 });

        layoutNodes.forEach((node) => {
          dagreGraph.setNode(node.id, {
            width: node.width ?? defaultNodeWidth,
            height: node.height ?? defaultNodeHeight
          });
        });
        layoutEdges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target));
        dagre.layout(dagreGraph);

        const layoutedStartNode = dagreGraph.node(startNode.id);
        if (!layoutedStartNode) return;
        const offsetX = startPosition.x - (layoutedStartNode.x - (startNode.width ?? 0) / 2);
        const offsetY = startPosition.y - (layoutedStartNode.y - (startNode.height ?? 0) / 2);
        const connectedNodeIds = new Set(layoutEdges.flatMap((edge) => [edge.source, edge.target]));
        const nodesByRank = new Map<
          number,
          Array<{ node: Node<FlowNodeItemType>; dagreNode: { x: number; y: number } }>
        >();

        layoutNodes.forEach((node) => {
          if (!connectedNodeIds.has(node.id)) return;
          const dagreNode = dagreGraph.node(node.id);
          const rank = Math.round(dagreNode.x);
          nodesByRank.set(rank, [...(nodesByRank.get(rank) ?? []), { node, dagreNode }]);
        });

        const nodesMap = new Map(nodes.map((node) => [node.id, node]));
        nodesByRank.forEach((nodesInRank) => {
          const minLeft = Math.min(
            ...nodesInRank.map(({ node, dagreNode }) => dagreNode.x - (node.width ?? 0) / 2)
          );
          nodesInRank.sort((a, b) => {
            const edgeA = layoutEdges.find((edge) => edge.target === a.node.id);
            const edgeB = layoutEdges.find((edge) => edge.target === b.node.id);
            const sourceA = nodesMap.get(edgeA?.source ?? '');
            const sourceB = nodesMap.get(edgeB?.source ?? '');
            const specialNodeTypes = [
              FlowNodeTypeEnum.ifElseNode,
              FlowNodeTypeEnum.userSelect,
              FlowNodeTypeEnum.classifyQuestion
            ];
            const isSourceASpecial =
              sourceA && specialNodeTypes.includes(sourceA.data.flowNodeType);
            const isSourceBSpecial =
              sourceB && specialNodeTypes.includes(sourceB.data.flowNodeType);

            if (
              edgeA?.source === edgeB?.source &&
              (isSourceASpecial || isSourceBSpecial || !sourceA || !sourceB)
            ) {
              return getHandleIndex(edgeA, sourceA) - getHandleIndex(edgeB, sourceB);
            }
            return a.dagreNode.y - b.dagreNode.y;
          });

          let currentY =
            Math.min(
              ...nodesInRank.map(({ dagreNode, node }) => dagreNode.y - (node.height ?? 0) / 2)
            ) + offsetY;
          nodesInRank.forEach(({ node }) => {
            const targetX = minLeft + offsetX;
            const diffX = targetX - node.position.x;
            const diffY = currentY - node.position.y;
            node.position = { x: targetX, y: currentY };
            currentY += (node.height ?? 0) + 80;

            if (syncChildNodes) {
              nodes.forEach((childNode) => {
                if (childNode.data.parentNodeId === node.id) {
                  childNode.position = {
                    x: childNode.position.x + diffX,
                    y: childNode.position.y + diffY
                  };
                }
              });
            }
          });
        });
      };

      const parentNodeIds = new Set<string>();
      const childNodesByParent = new Map<string, Node<FlowNodeItemType>[]>();
      newNodes.forEach((node) => {
        const parentId = node.data.parentNodeId;
        if (!parentId) return;
        parentNodeIds.add(parentId);
        childNodesByParent.set(parentId, [...(childNodesByParent.get(parentId) ?? []), node]);
      });

      childNodesByParent.forEach((childNodes) => {
        updateNodesPosition({
          startNode: childNodes[0],
          nodes: childNodes,
          edges,
          syncChildNodes: false
        });
      });

      newNodes
        .filter((node) => parentNodeIds.has(node.id))
        .forEach((node) => {
          const size = getParentNodeSizeAndPosition({ nodes: newNodes, parentId: node.id });
          if (!size) return;
          node.position = { x: size.parentX, y: size.parentY };
          node.width = size.nodeWidth;
          node.height = size.nodeHeight;
          node.data.inputs.forEach((input) => {
            if (input.key === NodeInputKeyEnum.nodeHeight) {
              input.value = size.childHeight;
            } else if (input.key === NodeInputKeyEnum.nodeWidth) {
              input.value = size.childWidth;
            }
          });
        });

      const startNode =
        newNodes.find((node) =>
          [
            FlowNodeTypeEnum.workflowStart,
            FlowNodeTypeEnum.pluginInput
          ].includes(node.data.flowNodeType)
        ) ?? newNodes[0];
      updateNodesPosition({
        startNode,
        nodes: newNodes,
        edges,
        syncChildNodes: true
      });

      newNodes.forEach((node) => {
        if (parentNodeIds.has(node.id)) return;
        const original = originalDimensions.get(node.id);
        node.width = original?.width;
        node.height = original?.height;
      });
      setNodes((latestNodes) =>
        mergeWorkflowLayoutNodes({
          currentNodes: latestNodes,
          layoutedNodes: newNodes,
          resizedNodeIds: parentNodeIds
        })
      );

      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const validNodes = getNodes().filter((node) => node.width && node.height);
      fitView({ nodes: validNodes, padding: 0.3 });

      return usedFallbackDimensions ? ('degraded' as const) : ('applied' as const);
    },
    [fitView, getEdges, getNodes, getParentNodeSizeAndPosition, setNodes]
  );

  const finishPendingRequest = useCallback((result: WorkflowAutoLayoutResult) => {
    const request = pendingRequestRef.current;
    if (!request) return;
    clearTimeout(request.timeout);
    if (request.animationFrame !== undefined) {
      window.cancelAnimationFrame(request.animationFrame);
    }
    pendingRequestRef.current = undefined;
    request.resolve(result);
  }, []);

  const runPendingRequest = useCallback(
    async (allowFallbackDimensions: boolean) => {
      const request = pendingRequestRef.current;
      if (!request || request.running) return;
      if (request.workflowDataRevision !== workflowDataRevisionRef.current) {
        finishPendingRequest('failed');
        return;
      }
      if (request.animationFrame !== undefined) {
        window.cancelAnimationFrame(request.animationFrame);
        request.animationFrame = undefined;
      }
      request.running = true;

      try {
        const result = await autoLayout({
          allowFallbackDimensions,
          expectedNodeIds: request.nodeIds
        });
        finishPendingRequest(result);
      } catch {
        finishPendingRequest('failed');
      }
    },
    [autoLayout, finishPendingRequest]
  );

  const requestAutoLayout = useCallback(
    ({ nodeIds, workflowDataRevision }: RequestAutoLayoutOptions) =>
      new Promise<WorkflowAutoLayoutResult>((resolve) => {
        finishPendingRequest('failed');
        const request: PendingAutoLayoutRequest = {
          nodeIds: new Set(nodeIds),
          workflowDataRevision,
          resolve,
          running: false,
          stableNodeSizeFrames: 0,
          timeout: setTimeout(() => {
            void runPendingRequest(true);
          }, autoLayoutInitializationTimeoutMs)
        };
        pendingRequestRef.current = request;
        setRequestVersion((version) => version + 1);
      }),
    [finishPendingRequest, runPendingRequest]
  );

  useEffect(() => {
    const request = pendingRequestRef.current;
    if (
      !request ||
      request.running ||
      request.workflowDataRevision !== workflowDataRevision ||
      !nodesInitialized ||
      !matchesWorkflowAutoLayoutRequest({ nodes: renderedNodes, nodeIds: request.nodeIds }) ||
      request.animationFrame !== undefined
    ) {
      return;
    }

    /** ReactFlow 首次初始化后，节点内部控件仍可能继续撑高，需要等尺寸连续两帧不变。 */
    const checkNodeSizes = () => {
      const currentRequest = pendingRequestRef.current;
      if (!currentRequest || currentRequest !== request || currentRequest.running) return;
      currentRequest.animationFrame = undefined;

      const signature = getWorkflowAutoLayoutNodeSizeSignature({
        nodes: getNodes(),
        nodeIds: currentRequest.nodeIds
      });
      if (signature === undefined) {
        currentRequest.lastNodeSizeSignature = undefined;
        currentRequest.stableNodeSizeFrames = 0;
      } else if (signature === currentRequest.lastNodeSizeSignature) {
        currentRequest.stableNodeSizeFrames += 1;
      } else {
        currentRequest.lastNodeSizeSignature = signature;
        currentRequest.stableNodeSizeFrames = 1;
      }

      if (currentRequest.stableNodeSizeFrames >= autoLayoutStableSizeFrameCount) {
        void runPendingRequest(false);
        return;
      }
      currentRequest.animationFrame = window.requestAnimationFrame(checkNodeSizes);
    };

    request.animationFrame = window.requestAnimationFrame(checkNodeSizes);
  }, [
    getNodes,
    nodesInitialized,
    renderedNodes,
    requestVersion,
    runPendingRequest,
    workflowDataRevision
  ]);

  useEffect(
    () => () => {
      finishPendingRequest('failed');
    },
    [finishPendingRequest]
  );

  return { autoLayout, requestAutoLayout };
};
