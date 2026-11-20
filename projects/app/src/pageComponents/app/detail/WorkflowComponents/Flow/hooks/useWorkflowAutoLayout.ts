import { useCallback, useEffect, useRef } from 'react';
import { useMemoizedFn } from 'ahooks';
import { cloneDeep } from 'lodash-es';
import dagre from '@dagrejs/dagre';
import type { Node } from '@xyflow/react';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { WorkflowSnapshot } from '@fastgpt/global/core/workflow/editor/types';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';
import { useWorkflowRuntime } from '@/web/core/workflow/editor/session/workflowSession';
import type { CanvasNode } from '@/web/core/workflow/editor/canvas/canvasTypes';
import {
  useWorkflowCanvasRendererValue,
  useWorkflowCanvasValue
} from '../canvas/workflowCanvasContext';
import { getParentNodeSizeAndPosition } from '../utils/layout';
import { getHandleIndex } from '../utils/edge';
import type { DimensionReader } from '../canvas/nodeDimensions';

const defaultNodeWidth = 420;
const defaultNodeHeight = 240;
const autoLayoutInitializationTimeoutMs = 5000;
const autoLayoutStableSizeFrameCount = 2;

export type WorkflowAutoLayoutResult = 'applied' | 'degraded' | 'failed';

type PendingAutoLayoutRequest = {
  nodeIds: Set<string>;
  releaseMeasurements: () => void;
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
  contentRevision: number;
};

type IdentifiedNode = { id: string };
type PositionedNode = {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
};

/** 判断当前画布是否已经完整加载了本次 Builder 应用的节点集合。 */
export const matchesWorkflowAutoLayoutRequest = <T extends IdentifiedNode>({
  nodes,
  nodeIds
}: {
  nodes: readonly T[];
  nodeIds: Set<string>;
}) => nodes.length === nodeIds.size && nodes.every((node) => nodeIds.has(node.id));

/**
 * 生成 Builder 目标节点的完整尺寸签名。
 * 节点集合不匹配或仍有节点未完成测量时返回 undefined，避免使用不完整尺寸开始布局。
 */
export const getWorkflowAutoLayoutNodeSizeSignature = <T extends IdentifiedNode>({
  nodes,
  nodeIds,
  getNodeDimension
}: {
  nodes: readonly T[];
  nodeIds: Set<string>;
  getNodeDimension: DimensionReader;
}) => {
  if (!matchesWorkflowAutoLayoutRequest({ nodes, nodeIds })) return;

  const sizes: string[] = [];
  for (const { id } of nodes) {
    const dimension = getNodeDimension(id);
    if (!dimension?.width || !dimension.height) return;
    sizes.push(`${id}:${dimension.width}:${dimension.height}`);
  }
  return sizes.sort().join('|');
};

/**
 * 把布局坐标合并到画布当前投影；尺寸由 DOM 测量，避免 Dagre 临时尺寸锁住容器伸缩。
 */
export const mergeWorkflowLayoutNodes = <T extends PositionedNode>({
  currentNodes,
  layoutedNodes
}: {
  currentNodes: T[];
  layoutedNodes: T[];
}) => {
  const layoutedNodesById = new Map(layoutedNodes.map((node) => [node.id, node]));

  return currentNodes.map((node) => {
    const layoutedNode = layoutedNodesById.get(node.id);
    if (!layoutedNode) return node;
    return {
      ...node,
      position: layoutedNode.position,
      width: undefined,
      height: undefined
    };
  });
};

/**
 * 提供工作流画布统一的自动布局能力。
 * 手动对齐立即执行；Builder 等待完整图的尺寸，超时后为未测量节点使用估算值。
 */
export const useWorkflowAutoLayout = () => {
  const runtime = useWorkflowRuntime();
  const actions = useWorkflowActions();
  const getNodes = useWorkflowCanvasRendererValue((value) => value.getNodes);
  const replaceNodes = useWorkflowCanvasRendererValue((value) => value.replaceNodes);
  const fitNodes = useWorkflowCanvasValue((value) => value.fitNodes);
  const getNodeDimension = useWorkflowCanvasValue((value) => value.getNodeDimension);
  const getNodeDimensions = useWorkflowCanvasValue((value) => value.getNodeDimensions);
  const requestNodeMeasurements = useWorkflowCanvasValue((value) => value.requestNodeMeasurements);
  const pendingRequestRef = useRef<PendingAutoLayoutRequest>();
  const mountedRef = useRef(false);

  const autoLayout = useMemoizedFn(
    async ({
      allowFallbackDimensions = false,
      expectedNodeIds,
      isRequestCurrent
    }: LayoutOptions = {}) => {
      const layoutSnapshot = runtime && !runtime.isDisposed() ? runtime.getWorkflow() : undefined;
      const currentNodes = getNodes();
      if (
        !runtime ||
        !layoutSnapshot ||
        currentNodes.length === 0 ||
        isRequestCurrent?.() === false ||
        (expectedNodeIds &&
          !matchesWorkflowAutoLayoutRequest({ nodes: currentNodes, nodeIds: expectedNodeIds }))
      ) {
        return 'failed' as const;
      }

      const edges = layoutSnapshot.edges;
      let usedFallbackDimensions = false;
      const newNodes = cloneDeep(currentNodes);
      for (const node of newNodes) {
        const dimension = getNodeDimensions(node.id)?.card;
        node.width = dimension?.width ?? node.width;
        node.height = dimension?.height ?? node.height;
        if (!node.width || !node.height) {
          if (!allowFallbackDimensions) return 'failed' as const;

          node.width = node.width || defaultNodeWidth;
          node.height = node.height || defaultNodeHeight;
          usedFallbackDimensions = true;
        }
      }
      const layoutNodesById = new Map(newNodes.map((node) => [node.id, node]));

      const workflowNodesById = new Map(
        layoutSnapshot.nodes.map((node) => [node.nodeId, node] as const)
      );
      const getRuntimeNode = (node?: CanvasNode) => {
        const data = node ? workflowNodesById.get(node.data.nodeId) : undefined;
        return node && data ? ({ ...node, data } as unknown as Node<FlowNodeItemType>) : undefined;
      };
      const updateNodesPosition = ({
        startNode,
        nodes,
        edges,
        syncChildNodes
      }: {
        startNode: CanvasNode;
        nodes: CanvasNode[];
        edges: WorkflowSnapshot['edges'];
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

      const childNodesByParent = new Map<string, CanvasNode[]>();
      newNodes.forEach((node) => {
        const parentId = node.data.parentNodeId;
        if (!parentId) return;
        const children = childNodesByParent.get(parentId);
        if (children) children.push(node);
        else childNodesByParent.set(parentId, [node]);
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
        .filter((node) => childNodesByParent.has(node.id))
        .forEach((node) => {
          const size = getParentNodeSizeAndPosition({
            parent: node,
            childNodes: childNodesByParent.get(node.id) ?? [],
            getNodeDimension: (nodeId) => {
              const node = layoutNodesById.get(nodeId);
              return node?.width && node.height
                ? { width: node.width, height: node.height }
                : undefined;
            },
            containerContentOffset: getNodeDimensions(node.id)?.containerContentOffset,
            containerContentSize: getNodeDimensions(node.id)?.containerContentSize
          });
          if (!size) return;
          node.position = { x: size.parentX, y: size.parentY };
          node.width = size.nodeWidth;
          node.height = size.nodeHeight;
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
      const previousNodes = new Map(currentNodes.map((node) => [node.id, node]));
      replaceNodes(renderNodes);
      const committed = actions.commitGeometry(
        renderNodes.flatMap((node) => {
          const previous = previousNodes.get(node.id);
          return previous &&
            (previous.position.x !== node.position.x || previous.position.y !== node.position.y)
            ? [{ nodeId: node.data.nodeId, position: node.position }]
            : [];
        })
      );

      if (!committed.ok) return 'failed' as const;
      const contentRevision = runtime.getSavepoint().contentRevision;

      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      // 等待期间画布可能已整体替换，旧布局不能再聚焦新画布。
      if (
        !mountedRef.current ||
        runtime.isDisposed() ||
        runtime.getSavepoint().contentRevision !== contentRevision ||
        isRequestCurrent?.() === false
      ) {
        return 'failed' as const;
      }
      fitNodes(
        currentNodes.map((node) => node.id),
        { padding: 0.3, ...(usedFallbackDimensions && { useEstimatedDimensions: true }) }
      );

      return usedFallbackDimensions ? ('degraded' as const) : ('applied' as const);
    }
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
      request.releaseMeasurements();
      request.resolve(result);
    },
    []
  );

  const requestAutoLayout = useMemoizedFn(
    ({ nodeIds, contentRevision }: RequestAutoLayoutOptions) =>
      new Promise<WorkflowAutoLayoutResult>((resolve) => {
        finishPendingRequest('failed');
        const isCurrent = () => pendingRequestRef.current === request;
        // 模型目录刷新只更换 Issue 快照，内容版本保持不变。
        const isSameWorkflow = () =>
          !!runtime &&
          !runtime.isDisposed() &&
          runtime.getSavepoint().contentRevision === contentRevision;

        const run = async (allowFallbackDimensions: boolean) => {
          if (!isCurrent() || request.running) return;
          if (!isSameWorkflow()) {
            finishPendingRequest('failed', request);
            return;
          }
          request.running = true;
          if (request.animationFrame !== undefined) {
            window.cancelAnimationFrame(request.animationFrame);
          }
          try {
            const result = await autoLayout({
              allowFallbackDimensions,
              expectedNodeIds: request.nodeIds,
              isRequestCurrent: isCurrent
            });
            finishPendingRequest(result, request);
          } catch {
            finishPendingRequest('failed', request);
          }
        };
        const requestedIds = new Set(nodeIds);
        const request: PendingAutoLayoutRequest = {
          nodeIds: requestedIds,
          releaseMeasurements: requestNodeMeasurements(requestedIds),
          resolve,
          running: false,
          stableNodeSizeFrames: 0,
          timeout: setTimeout(() => void run(true), autoLayoutInitializationTimeoutMs)
        };
        pendingRequestRef.current = request;

        // 只读完整投影和真实尺寸索引，虚拟化下无需等所有节点挂到 React Flow。
        const checkNodeSizes = () => {
          if (!isCurrent() || request.running) return;
          if (!isSameWorkflow()) {
            finishPendingRequest('failed', request);
            return;
          }

          const signature = getWorkflowAutoLayoutNodeSizeSignature({
            nodes: getNodes(),
            nodeIds: request.nodeIds,
            getNodeDimension
          });
          request.stableNodeSizeFrames =
            signature === undefined
              ? 0
              : signature === request.lastNodeSizeSignature
                ? request.stableNodeSizeFrames + 1
                : 1;
          request.lastNodeSizeSignature = signature;
          if (request.stableNodeSizeFrames >= autoLayoutStableSizeFrameCount) {
            void run(false);
          } else {
            request.animationFrame = window.requestAnimationFrame(checkNodeSizes);
          }
        };
        request.animationFrame = window.requestAnimationFrame(checkNodeSizes);
      })
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      finishPendingRequest('failed');
    };
  }, [finishPendingRequest]);

  return { autoLayout, requestAutoLayout };
};
