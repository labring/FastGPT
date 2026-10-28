import { useCallback, useEffect, useRef, useState } from 'react';
import { cloneDeep } from 'lodash-es';
import dagre from '@dagrejs/dagre';
import { type Edge, type Node, useNodes, useNodesInitialized } from '@xyflow/react';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { WorkflowSnapshot } from '@fastgpt/global/core/workflow/editor/types';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';
import {
  useWorkflowRuntime,
  useWorkflowSnapshot
} from '@/web/core/workflow/editor/session/workflowSession';
import type { CanvasNode } from '@/web/core/workflow/editor/canvas/canvasTypes';
import {
  useWorkflowCanvasRendererValue,
  useWorkflowCanvasValue
} from '../canvas/workflowCanvasContext';
import { getParentNodeSizeAndPosition } from '../utils/layout';
import { getHandleIndex } from '../utils/edge';

const defaultNodeWidth = 420;
const defaultNodeHeight = 240;
const autoLayoutInitializationTimeoutMs = 5000;
const autoLayoutStableSizeFrameCount = 2;

export type WorkflowAutoLayoutResult = 'applied' | 'degraded' | 'failed';

type PendingAutoLayoutRequest = {
  nodeIds: Set<string>;
  workflowSnapshot: WorkflowSnapshot;
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
  /** 异步等待视图更新期间，请求被替换或组件卸载时停止收尾。 */
  isRequestCurrent?: () => boolean;
};

type RequestAutoLayoutOptions = {
  nodeIds: string[];
  workflowSnapshot: WorkflowSnapshot;
};

type IdentifiedNode = { id: string; width?: number; height?: number };
type PositionedNode = { id: string; position: { x: number; y: number } };

/** 判断当前画布是否已经完整加载了本次 Builder 应用的节点集合。 */
export const matchesWorkflowAutoLayoutRequest = <T extends IdentifiedNode>({
  nodes,
  nodeIds
}: {
  nodes: T[];
  nodeIds: Set<string>;
}) => nodes.length === nodeIds.size && nodes.every((node) => nodeIds.has(node.id));

/**
 * 生成 Builder 目标节点的完整尺寸签名。
 * 节点集合不匹配或仍有节点未完成测量时返回 undefined，避免使用不完整尺寸开始布局。
 */
export const getWorkflowAutoLayoutNodeSizeSignature = <T extends IdentifiedNode>({
  nodes,
  nodeIds
}: {
  nodes: T[];
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
 * 把布局坐标合并到画布当前投影；节点语义始终由 Runtime 持有。
 */
export const mergeWorkflowLayoutNodes = <T extends PositionedNode>({
  currentNodes,
  layoutedNodes
}: {
  currentNodes: T[];
  layoutedNodes: T[];
}) => {
  const layoutedPositions = new Map(layoutedNodes.map((node) => [node.id, node.position]));

  return currentNodes.map((node) =>
    layoutedPositions.has(node.id) ? { ...node, position: layoutedPositions.get(node.id)! } : node
  );
};

/**
 * 提供工作流画布统一的自动布局能力。
 * 手动对齐立即执行；Builder 对齐会等待本次导入的节点集合完成 ReactFlow 初始化。
 */
export const useWorkflowAutoLayout = () => {
  const runtime = useWorkflowRuntime();
  const workflowSnapshot = useWorkflowSnapshot();
  const actions = useWorkflowActions();
  const getNodes = useWorkflowCanvasRendererValue((value) => value.getNodes);
  const edges = useWorkflowCanvasRendererValue((value) => value.edges);
  const replaceNodes = useWorkflowCanvasRendererValue((value) => value.replaceNodes);
  const fitNodes = useWorkflowCanvasValue((value) => value.fitNodes);
  const getNodeDimension = useWorkflowCanvasValue((value) => value.getNodeDimension);
  const renderedNodes = useNodes<CanvasNode>();
  const nodesInitialized = useNodesInitialized();
  const pendingRequestRef = useRef<PendingAutoLayoutRequest>();
  const mountedRef = useRef(false);
  const [requestVersion, setRequestVersion] = useState(0);

  const autoLayout = useCallback(
    async ({
      allowFallbackDimensions = false,
      expectedNodeIds,
      isRequestCurrent
    }: LayoutOptions = {}) => {
      const layoutSnapshot = workflowSnapshot;
      const currentNodes = getNodes();
      if (
        !runtime ||
        !layoutSnapshot ||
        currentNodes.length === 0 ||
        (expectedNodeIds &&
          !matchesWorkflowAutoLayoutRequest({ nodes: currentNodes, nodeIds: expectedNodeIds }))
      ) {
        return 'failed' as const;
      }

      let usedFallbackDimensions = false;
      const newNodes = cloneDeep(currentNodes);

      if (allowFallbackDimensions) {
        newNodes.forEach((node) => {
          if (!node.width) {
            node.width = defaultNodeWidth;
            usedFallbackDimensions = true;
          }
          if (!node.height) {
            node.height = defaultNodeHeight;
            usedFallbackDimensions = true;
          }
        });
      }

      if (newNodes.some((node) => !node.width || !node.height)) {
        return 'failed' as const;
      }

      const workflowNodesById = new Map(
        layoutSnapshot.nodes.map((node) => [node.nodeId, node] as const)
      );
      const getRuntimeNode = (node?: CanvasNode) => {
        const data = node ? workflowNodesById.get(node.data.nodeId) : undefined;
        return node && data ? ({ ...node, data } as unknown as Node<FlowNodeItemType>) : undefined;
      };
      const toLayoutNodes = (nodes: CanvasNode[]) =>
        nodes as unknown as Parameters<typeof getParentNodeSizeAndPosition>[0]['nodes'];
      const updateNodesPosition = ({
        startNode,
        nodes,
        edges,
        syncChildNodes
      }: {
        startNode: CanvasNode;
        nodes: CanvasNode[];
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
          Array<{ node: CanvasNode; dagreNode: { x: number; y: number } }>
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
              return (
                getHandleIndex(edgeA, getRuntimeNode(sourceA)) -
                getHandleIndex(edgeB, getRuntimeNode(sourceB))
              );
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
      const childNodesByParent = new Map<string, CanvasNode[]>();
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
          const size = getParentNodeSizeAndPosition({
            nodes: toLayoutNodes(newNodes),
            parentId: node.id,
            getNodeDimension
          });
          if (!size) return;
          node.position = { x: size.parentX, y: size.parentY };
        });

      const startNode =
        newNodes.find((node) =>
          [FlowNodeTypeEnum.workflowStart, FlowNodeTypeEnum.pluginInput].includes(
            node.data.flowNodeType
          )
        ) ?? newNodes[0];
      updateNodesPosition({
        startNode,
        nodes: newNodes,
        edges,
        syncChildNodes: true
      });

      const renderNodes = mergeWorkflowLayoutNodes({
        currentNodes: getNodes(),
        layoutedNodes: newNodes
      });
      replaceNodes(renderNodes);
      actions.commitGeometry(
        renderNodes.flatMap((node) => {
          const previous = currentNodes.find((current) => current.id === node.id);
          return previous &&
            (previous.position.x !== node.position.x || previous.position.y !== node.position.y)
            ? [{ nodeId: node.data.nodeId, position: node.position }]
            : [];
        })
      );

      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      // 等待期间画布可能已整体替换，旧布局不能再聚焦新画布。
      if (
        !mountedRef.current ||
        runtime.getWorkflow() !== layoutSnapshot ||
        isRequestCurrent?.() === false
      ) {
        return 'failed' as const;
      }
      const validNodes = getNodes().filter((node) => node.width && node.height);
      fitNodes(
        validNodes.map((node) => node.id),
        { padding: 0.3 }
      );

      return usedFallbackDimensions ? ('degraded' as const) : ('applied' as const);
    },
    [actions, edges, fitNodes, getNodeDimension, getNodes, replaceNodes, runtime, workflowSnapshot]
  );

  const finishPendingRequest = useCallback(
    (result: WorkflowAutoLayoutResult, expectedRequest = pendingRequestRef.current) => {
      const request = pendingRequestRef.current;
      // 布局异步完成时，只能结束自己所属的请求，不能结束后来替换进来的请求。
      if (!request || request !== expectedRequest) return;
      clearTimeout(request.timeout);
      if (request.animationFrame !== undefined) {
        window.cancelAnimationFrame(request.animationFrame);
      }
      pendingRequestRef.current = undefined;
      request.resolve(result);
    },
    []
  );

  const runPendingRequest = useCallback(
    async (allowFallbackDimensions: boolean) => {
      const request = pendingRequestRef.current;
      if (!request || request.running) return;
      if (request.workflowSnapshot !== workflowSnapshot) {
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
          expectedNodeIds: request.nodeIds,
          isRequestCurrent: () => pendingRequestRef.current === request
        });
        finishPendingRequest(result, request);
      } catch {
        finishPendingRequest('failed', request);
      }
    },
    [autoLayout, finishPendingRequest, workflowSnapshot]
  );

  const requestAutoLayout = useCallback(
    ({ nodeIds, workflowSnapshot }: RequestAutoLayoutOptions) =>
      new Promise<WorkflowAutoLayoutResult>((resolve) => {
        finishPendingRequest('failed');
        const request: PendingAutoLayoutRequest = {
          nodeIds: new Set(nodeIds),
          workflowSnapshot,
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
    if (request && request.workflowSnapshot !== workflowSnapshot) {
      finishPendingRequest('failed', request);
      return;
    }
    if (
      !request ||
      request.running ||
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
      if (currentRequest.workflowSnapshot !== workflowSnapshot) {
        finishPendingRequest('failed', currentRequest);
        return;
      }

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
    finishPendingRequest,
    getNodes,
    nodesInitialized,
    renderedNodes,
    requestVersion,
    runPendingRequest,
    workflowSnapshot
  ]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      finishPendingRequest('failed');
    };
  }, [finishPendingRequest]);

  return { autoLayout, requestAutoLayout };
};
