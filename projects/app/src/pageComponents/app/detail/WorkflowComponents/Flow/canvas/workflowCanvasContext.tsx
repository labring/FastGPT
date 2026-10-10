// Renderer canvas state: projection data plus ReactFlow interaction state.
// Runtime 拥有唯一的 Workflow Document / Node View；派生索引直接读 Runtime 结构快照与
// 节点视图，画布数组只承载 reactflow 交互状态（拖拽帧、测量尺寸、层级）。
// 结构、几何与边写入由调用点直接使用 editor adapter 提交。
import { isNestedParentNodeType } from '@fastgpt/global/core/workflow/node/constant';
import { createContext, useContextSelector } from 'use-context-selector';

import { useMemoizedFn } from 'ahooks';
import React, { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Edge,
  type EdgeChange,
  type NodeChange,
  applyEdgeChanges as applyReactFlowEdgeChanges,
  applyNodeChanges as applyReactFlowNodeChanges,
  useReactFlow,
  useStore
} from 'reactflow';
import {
  useWorkflowIssueFocusRef,
  useWorkflowOverlayRef,
  useWorkflowRuntime,
  useWorkflowViewTick
} from '@/web/core/workflow/editor/session/workflowSession';
import {
  createProjectionCache,
  projectRuntimeCanvas
} from '@/web/core/workflow/editor/canvas/projectWorkflowCanvas';
import type { CanvasNode, CanvasNodeData } from '@/web/core/workflow/editor/canvas/canvasTypes';
import {
  classifyRenderableGraph,
  createMeasurementQueue,
  createDimensionBatcher,
  hasValidSourceHandleMeasurement,
  getUnmeasuredViewportFitNodeIds,
  getViewportFitNodeIds,
  type CanvasViewport,
  type DimensionMeasurement,
  type DimensionRegistration,
  type NodeDimensions,
  type NodeCardDimension,
  getViewportForNodeIds,
  type ViewportFitOptions
} from './nodeDimensions';
import {
  getParentNodeSizeAndPosition,
  normalizeContainerChildPositions,
  CONTAINER_CHILD_PADDING,
  type ParentNodeLayout
} from '../utils/layout';
import { getNodeShellHandleModel } from '../utils/nodeHandle';

type OnChange<ChangesType> = (changes: ChangesType[]) => void;

type WorkflowRenderMode = 'full' | 'shell' | 'measurement';

// region publicApi Canvas selector contract

type WorkflowCanvasContextType = {
  fitNodes: (nodeIds?: readonly string[], options?: ViewportFitOptions) => boolean;
  nodeDimensions: ReadonlyMap<string, NodeDimensions>;
  containerLayouts: ReadonlyMap<string, ParentNodeLayout>;
  getNodeDimension: (nodeId: string) => NodeCardDimension | undefined;
  getNodeDimensions: (nodeId: string) => NodeDimensions | undefined;
  registerNodeMeasurement: (nodeId: string) => DimensionRegistration;
  pinNodeFocus: (nodeId: string) => void;
  unpinNodeFocus: (nodeId: string) => void;
  renderModes: ReadonlyMap<string, WorkflowRenderMode>;
  measurementNodeIds: readonly string[];
};
const WorkflowCanvasContext = createContext<WorkflowCanvasContextType>({
  fitNodes: function () {
    throw new Error('Function not implemented.');
  },
  nodeDimensions: new Map(),
  containerLayouts: new Map(),
  getNodeDimension: function () {
    throw new Error('Function not implemented.');
  },
  getNodeDimensions: function () {
    throw new Error('Function not implemented.');
  },
  registerNodeMeasurement: function () {
    throw new Error('Function not implemented.');
  },
  pinNodeFocus: function () {
    throw new Error('Function not implemented.');
  },
  unpinNodeFocus: function () {
    throw new Error('Function not implemented.');
  },
  renderModes: new Map(),
  measurementNodeIds: []
});

export const useWorkflowCanvasValue = <T,>(selector: (value: WorkflowCanvasContextType) => T): T =>
  useContextSelector(WorkflowCanvasContext, selector);

/** ReactFlow 本地数组与 change handler，只供 Canvas renderer / interaction 使用。 */
type WorkflowCanvasRendererContextType = {
  nodes: CanvasNode[];
  renderedNodes: CanvasNode[];
  replaceNodes: (nodes: CanvasNode[]) => void;
  applyNodeChanges: OnChange<NodeChange>;
  selectNodes: (nodeIds: readonly string[]) => void;
  getNodes: () => CanvasNode[];
  edges: Edge<any>[];
  renderedEdges: Edge<any>[];
  replaceEdges: (edges: Edge<any>[]) => void;
  applyEdgeChanges: OnChange<EdgeChange>;
  onViewportChange: (viewport: CanvasViewport) => void;
};

const WorkflowCanvasRendererContext = createContext<WorkflowCanvasRendererContextType>({
  nodes: [],
  renderedNodes: [],
  replaceNodes: function () {
    throw new Error('Function not implemented.');
  },
  applyNodeChanges: function () {
    throw new Error('Function not implemented.');
  },
  selectNodes: function () {
    throw new Error('Function not implemented.');
  },
  getNodes: function () {
    throw new Error('Function not implemented.');
  },
  edges: [],
  renderedEdges: [],
  replaceEdges: function () {
    throw new Error('Function not implemented.');
  },
  applyEdgeChanges: function () {
    throw new Error('Function not implemented.');
  },
  onViewportChange: function () {
    throw new Error('Function not implemented.');
  }
});

export const useWorkflowCanvasRendererValue = <T,>(
  selector: (value: WorkflowCanvasRendererContextType) => T
): T => useContextSelector(WorkflowCanvasRendererContext, selector);

// endregion

// region internalState Canvas helpers

type PendingFitRequest = {
  nodeIds?: readonly string[];
  options?: ViewportFitOptions;
};

const defaultViewport: CanvasViewport = {
  x: 0,
  y: 0,
  zoom: 1,
  width: 0,
  height: 0
};

const scheduleFrame = (callback: () => void) => {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  return setTimeout(callback, 0) as unknown as number;
};

const cancelFrame = (handle: number) => {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle);
};

const areSourceHandleCentersEqual = (
  previous: ReadonlyMap<string, { x: number; y: number }> | undefined,
  next: ReadonlyMap<string, { x: number; y: number }> | undefined
) => {
  if (previous === next) return true;
  if (!previous || !next || previous.size !== next.size) return false;
  return [...next].every(([handleId, center]) => {
    const previousCenter = previous.get(handleId);
    return previousCenter?.x === center.x && previousCenter?.y === center.y;
  });
};

// endregion

// region canvasProvider Canvas projection and interaction state

const WorkflowCanvasProvider = ({ children }: { children: ReactNode }) => {
  // region canvasState Canvas runtime state and render refs

  const { setViewport } = useReactFlow();
  const canvasWidth = useStore((state) => state.width);
  const canvasHeight = useStore((state) => state.height);
  const runtime = useWorkflowRuntime();
  const viewTick = useWorkflowViewTick();
  const overlaysRef = useWorkflowOverlayRef();
  // 标红焦点归 host：投影时合并，画布数组不再是问题状态的写入方。
  const issueFocusRef = useWorkflowIssueFocusRef();

  // 交互状态层：reactflow 本地数组，语义值以 Runtime 投影为准。
  const [nodes, setNodesRaw] = useState<CanvasNode[]>([]);
  const [renderedNodes, setRenderedNodesRaw] = useState<CanvasNode[]>([]);
  const [edges, setEdgesRaw] = useState<Edge<any>[]>([]);
  const [renderedEdges, setRenderedEdgesRaw] = useState<Edge<any>[]>([]);
  // ref 与本地数组同步更新，保证同一 tick 内连续写入（先删节点再删边等）读到最新值。
  const nodesRef = useRef<CanvasNode[]>(nodes);
  const edgesRef = useRef<Edge<any>[]>(edges);
  const renderedNodesRef = useRef<CanvasNode[]>([]);
  const renderedEdgesRef = useRef<Edge<any>[]>([]);
  // React Flow 的挂载集合只增量扩展；尺寸回写不应替换现有节点身份。
  // shortcut: 已挂载节点只在工作流删除或折叠时回收，超大图再增加按距离回收。
  const renderedNodeIdsRef = useRef(new Set<string>());
  const renderedEdgeIdsRef = useRef(new Set<string>());
  const projectionCache = useRef(createProjectionCache());
  const [nodeDimensions, setNodeDimensions] = useState<ReadonlyMap<string, NodeDimensions>>(
    () => new Map()
  );
  const nodeDimensionsRef = useRef(new Map<string, NodeDimensions>());
  const [containerLayouts, setContainerLayouts] = useState<ReadonlyMap<string, ParentNodeLayout>>(
    () => new Map()
  );
  const containerLayoutsRef = useRef(new Map<string, ParentNodeLayout>());
  const activeNodeIdsRef = useRef(new Set(nodes.map((node) => node.id)));
  const [renderModes, setRenderModes] = useState<ReadonlyMap<string, WorkflowRenderMode>>(
    () => new Map()
  );
  const renderModesRef = useRef<ReadonlyMap<string, WorkflowRenderMode>>(new Map());
  const [measurementNodeIds, setMeasurementNodeIds] = useState<string[]>([]);
  const measurementNodeIdsRef = useRef(new Set<string>());
  const measurementQueueRef = useRef(createMeasurementQueue());
  const viewportRef = useRef<CanvasViewport>(defaultViewport);
  const pendingViewportRef = useRef<CanvasViewport>();
  const renderStateFrameRef = useRef<number>();
  const measurementFrameRef = useRef<number>();
  const nodeMeasurementKeysRef = useRef(new Map<string, { data: CanvasNodeData; key: string }>());
  const nodeDataGenerationsRef = useRef(new Map<string, number>());
  const measurementGenerationsRef = useRef(new Map<string, number>());
  const nextMeasurementGenerationRef = useRef(0);
  const focusPinnedNodeIdsRef = useRef(new Set<string>());
  const staleDimensionNodeIdsRef = useRef(new Set<string>());
  const initializedCanvasRef = useRef(false);
  const newContainerIdsRef = useRef(new Set<string>());
  const pendingFitRef = useRef<PendingFitRequest>();

  // endregion

  // region canvasProjection Canvas projection and virtualization

  const publishMeasurementNodeIds = (next: Set<string>) => {
    const previous = measurementNodeIdsRef.current;
    if (previous.size === next.size && [...previous].every((nodeId) => next.has(nodeId))) return;
    measurementNodeIdsRef.current = next;
    setMeasurementNodeIds([...next]);
  };

  const publishRenderModes = (next: ReadonlyMap<string, WorkflowRenderMode>) => {
    const previous = renderModesRef.current;
    if (
      previous.size === next.size &&
      [...next].every(([nodeId, mode]) => previous.get(nodeId) === mode)
    ) {
      return;
    }
    renderModesRef.current = next;
    setRenderModes(next);
  };

  const publishRenderedGraph = (nextNodes: CanvasNode[], nextEdges: Edge<any>[]) => {
    const previousNodes = renderedNodesRef.current;
    const previousEdges = renderedEdgesRef.current;
    const nodesUnchanged =
      previousNodes.length === nextNodes.length &&
      previousNodes.every((node, index) => node === nextNodes[index]);
    const edgesUnchanged =
      previousEdges.length === nextEdges.length &&
      previousEdges.every((edge, index) => edge === nextEdges[index]);

    if (nodesUnchanged && edgesUnchanged) return;
    renderedNodesRef.current = nextNodes;
    renderedEdgesRef.current = nextEdges;
    setRenderedNodesRaw(nextNodes);
    setRenderedEdgesRaw(nextEdges);
  };

  const publishContainerLayouts = (next: ReadonlyMap<string, ParentNodeLayout>) => {
    const previous = containerLayoutsRef.current;
    const same =
      previous.size === next.size &&
      [...next].every(([nodeId, layout]) => {
        const old = previous.get(nodeId);
        return (
          old?.parentX === layout.parentX &&
          old?.parentY === layout.parentY &&
          old?.childWidth === layout.childWidth &&
          old?.childHeight === layout.childHeight &&
          old?.nodeWidth === layout.nodeWidth &&
          old?.nodeHeight === layout.nodeHeight &&
          old?.contentOffset?.x === layout.contentOffset?.x &&
          old?.contentOffset?.y === layout.contentOffset?.y &&
          old?.folded === layout.folded &&
          old?.positionDelta.x === layout.positionDelta.x &&
          old?.positionDelta.y === layout.positionDelta.y &&
          old?.childBounds?.left === layout.childBounds?.left &&
          old?.childBounds?.top === layout.childBounds?.top &&
          old?.childBounds?.right === layout.childBounds?.right &&
          old?.childBounds?.bottom === layout.childBounds?.bottom
        );
      });
    if (same) return;
    const published = new Map(next);
    containerLayoutsRef.current = published;
    setContainerLayouts(published);
  };

  /** 依赖直接子节点尺寸的容器按深度自底向上计算，结果只留在 renderer Canvas State。 */
  const recomputeContainerLayouts = (
    sourceNodes: CanvasNode[],
    dimensions: ReadonlyMap<string, NodeDimensions>
  ) => {
    // 布局函数只读 Node 的位置与父子字段；语义字段已从 CanvasNodeData 移除，在边界保留只读类型。
    const toLayoutNodes = (nodes: CanvasNode[]) =>
      nodes as unknown as Parameters<typeof getParentNodeSizeAndPosition>[0]['nodes'];
    const nodeById = new Map(sourceNodes.map((node) => [node.id, node]));
    const parentIds = new Set(
      sourceNodes
        .filter((node) => isNestedParentNodeType(node.data.flowNodeType))
        .map((node) => node.id)
    );
    const childrenByParent = new Map<string, CanvasNode[]>();
    sourceNodes.forEach((node) => {
      if (!node.data.parentNodeId || !parentIds.has(node.data.parentNodeId)) return;
      const children = childrenByParent.get(node.data.parentNodeId) ?? [];
      children.push(node);
      childrenByParent.set(node.data.parentNodeId, children);
    });

    const getDepth = (nodeId: string) => {
      let depth = 0;
      let parentId = nodeById.get(nodeId)?.data.parentNodeId;
      const visited = new Set<string>();
      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        depth += 1;
        parentId = nodeById.get(parentId)?.data.parentNodeId;
      }
      return depth;
    };

    const orderedParentIds = [...parentIds].sort((left, right) => getDepth(right) - getDepth(left));
    const layouts = new Map<string, ParentNodeLayout>();
    let nextNodes = sourceNodes;
    const nodeIndexById = new Map(sourceNodes.map((node, index) => [node.id, index]));
    const writableNodes = new Map<string, CanvasNode>();

    // 只复制真正改位置的节点；否则一次容器测量会让整张画布的 props 全部换身份。
    const getWritableNode = (nodeId: string) => {
      const existing = writableNodes.get(nodeId);
      if (existing) return existing;

      const index = nodeIndexById.get(nodeId);
      if (index === undefined) return;
      if (nextNodes === sourceNodes) nextNodes = sourceNodes.slice();

      const current = nextNodes[index];
      if (!current) return;
      const writable = { ...current, position: { ...current.position } };
      nextNodes[index] = writable;
      writableNodes.set(nodeId, writable);
      return writable;
    };

    const getDimension = (nodeId: string) => {
      if (staleDimensionNodeIdsRef.current.has(nodeId)) return undefined;
      const layout = layouts.get(nodeId);
      if (layout) return { width: layout.nodeWidth, height: layout.nodeHeight };
      return dimensions.get(nodeId)?.card;
    };

    const getInitialChildBounds = (parentId: string) => {
      const parent = nextNodes.find((node) => node.id === parentId);
      const contentOffset = dimensions.get(parentId)?.containerContentOffset;
      if (!parent || !contentOffset) return;

      return {
        left: parent.position.x + contentOffset.x + CONTAINER_CHILD_PADDING,
        top: parent.position.y + contentOffset.y + CONTAINER_CHILD_PADDING
      };
    };

    orderedParentIds.forEach((parentId) => {
      const previousLayout = containerLayoutsRef.current.get(parentId);
      const initialChildBounds = getInitialChildBounds(parentId);
      const contentOffset = dimensions.get(parentId)?.containerContentOffset;
      const hasMatchingContentOffset =
        previousLayout?.contentOffset?.x === contentOffset?.x &&
        previousLayout?.contentOffset?.y === contentOffset?.y;
      let layout = getParentNodeSizeAndPosition({
        nodes: toLayoutNodes(nextNodes),
        parentId,
        getNodeDimension: getDimension,
        previousChildBounds: hasMatchingContentOffset ? previousLayout?.childBounds : undefined,
        previousParentPosition:
          hasMatchingContentOffset && previousLayout
            ? { x: previousLayout.parentX, y: previousLayout.parentY }
            : undefined,
        initialChildBounds
      });

      if (layout?.childBounds && newContainerIdsRef.current.has(parentId)) {
        const children = childrenByParent.get(parentId) ?? [];
        if (children.length > 1) {
          children.forEach((child) => getWritableNode(child.id));
          normalizeContainerChildPositions({
            nodes: toLayoutNodes(nextNodes),
            parentId,
            bounds: layout.childBounds,
            targetOrigin: initialChildBounds ?? {
              left: nextNodes.find((node) => node.id === parentId)?.position.x ?? 0,
              top: nextNodes.find((node) => node.id === parentId)?.position.y ?? 0
            }
          });
          layout = getParentNodeSizeAndPosition({
            nodes: toLayoutNodes(nextNodes),
            parentId,
            getNodeDimension: getDimension,
            previousChildBounds: undefined,
            previousParentPosition: undefined,
            initialChildBounds
          });
          newContainerIdsRef.current.delete(parentId);
        }
      }

      if (layout?.positionDelta && (layout.positionDelta.x !== 0 || layout.positionDelta.y !== 0)) {
        const writableParent = getWritableNode(parentId);
        if (writableParent) {
          writableParent.position = { x: layout.parentX, y: layout.parentY };
        }
      }

      if (layout) {
        layouts.set(parentId, { ...layout, contentOffset });
      } else if (previousLayout) {
        layouts.set(parentId, previousLayout);
      }
    });

    return { nodes: nextNodes, layouts };
  };

  const updateContainerLayouts = (
    sourceNodes: CanvasNode[],
    dimensions: ReadonlyMap<string, NodeDimensions>
  ) => {
    const result = recomputeContainerLayouts(sourceNodes, dimensions);
    publishContainerLayouts(result.layouts);
    return result.nodes;
  };

  const flushDimensionMeasurements = useMemoizedFn((updates: DimensionMeasurement[]) => {
    const next = new Map(nodeDimensionsRef.current);
    const completed = new Set<string>();
    let changed = false;

    updates.forEach((update) => {
      if (
        !activeNodeIdsRef.current.has(update.nodeId) ||
        measurementGenerationsRef.current.get(update.nodeId) !== update.generation
      ) {
        return;
      }

      completed.add(update.nodeId);
      staleDimensionNodeIdsRef.current.delete(update.nodeId);
      measurementQueueRef.current.remove(update.nodeId);
      const previous = next.get(update.nodeId);
      if (
        previous?.card.width === update.dimension.card.width &&
        previous?.card.height === update.dimension.card.height &&
        previous?.occupied.width === update.dimension.occupied.width &&
        previous?.occupied.height === update.dimension.occupied.height &&
        previous?.containerContentOffset?.x === update.dimension.containerContentOffset?.x &&
        previous?.containerContentOffset?.y === update.dimension.containerContentOffset?.y &&
        areSourceHandleCentersEqual(
          previous?.sourceHandleCenters,
          update.dimension.sourceHandleCenters
        )
      ) {
        return;
      }

      next.set(update.nodeId, update.dimension);
      changed = true;
    });

    if (changed) {
      nodeDimensionsRef.current = next;
      setNodeDimensions(next);
    }

    if (completed.size > 0) {
      const nextNodes = updateContainerLayouts(nodesRef.current, next);
      if (nextNodes !== nodesRef.current) {
        nodesRef.current = nextNodes;
        setNodesRaw(nextNodes);
      }
      publishMeasurementNodeIds(
        new Set([...measurementNodeIdsRef.current].filter((nodeId) => !completed.has(nodeId)))
      );
      reconcileRenderState(nextNodes);
      applyPendingViewportFit();
    }
  });
  const [dimensionBatcher] = useState(() =>
    createDimensionBatcher({ onFlush: flushDimensionMeasurements })
  );

  /** 每帧最多激活 8 个离屏完整节点；已激活的节点完成测量后才释放槽位。 */
  function scheduleMeasurementFrame() {
    if (measurementFrameRef.current !== undefined) return;
    measurementFrameRef.current = scheduleFrame(() => {
      measurementFrameRef.current = undefined;
      const capacity = 8 - measurementNodeIdsRef.current.size;
      if (capacity <= 0) return;
      const activeNodeIds = activeNodeIdsRef.current;
      const currentModes = renderModesRef.current;
      const entries = measurementQueueRef.current.take(capacity, (entry) => {
        if (!activeNodeIds.has(entry.nodeId)) return false;
        if (currentModes.get(entry.nodeId) === 'full') return false;
        return nodeDataGenerationsRef.current.get(entry.nodeId) === entry.generation;
      });

      if (entries.length > 0) {
        const next = new Set(measurementNodeIdsRef.current);
        entries.forEach((entry) => next.add(entry.nodeId));
        publishMeasurementNodeIds(next);
        scheduleRenderStateFrame();
      }

      if (measurementQueueRef.current.getSize() > 0) scheduleMeasurementFrame();
    });
  }

  /** 根据当前 viewport 重算 full/shell；离屏节点保留估算 shell，进入视口后再测量。 */
  function reconcileRenderState(nextNodes: CanvasNode[]) {
    const renderDimensions = new Map(
      [...nodeDimensionsRef.current].filter(
        ([nodeId]) => !staleDimensionNodeIdsRef.current.has(nodeId)
      )
    );
    const nodeById = new Map(nextNodes.map((node) => [node.id, node]));
    const isDimensionReady = (node: CanvasNode) => {
      if (staleDimensionNodeIdsRef.current.has(node.id)) return false;

      // CanvasNode 不再携带语义字段；shell 句柄拓扑按 nodeId 从 Runtime 取 scoped snapshot。
      const snapshot = runtime?.getNode(node.id);
      if (!snapshot) return false;

      return hasValidSourceHandleMeasurement({
        expectedHandleIds: getNodeShellHandleModel(snapshot).sourceHandles.map(
          (handle) => handle.handleId
        ),
        dimension: nodeDimensionsRef.current.get(node.id)
      });
    };
    const viewportNodes = nextNodes.map((node) => ({
      id: node.id,
      position: node.position,
      parentNodeId: node.data.parentNodeId,
      isFolded: node.data.isFolded,
      selected: node.selected,
      dragging: node.dragging,
      focusPinned: focusPinnedNodeIdsRef.current.has(node.id)
    }));
    const renderedGraph = classifyRenderableGraph({
      nodes: viewportNodes,
      edges: edgesRef.current,
      dimensions: renderDimensions,
      viewport: viewportRef.current
    });
    const classification = renderedGraph;
    const nextModes = new Map<string, WorkflowRenderMode>();
    const pendingFitNodeIds = pendingFitRef.current
      ? new Set(
          getUnmeasuredViewportFitNodeIds({
            nodes: viewportNodes,
            nodeIds: pendingFitRef.current.nodeIds,
            dimensions: renderDimensions
          })
        )
      : new Set<string>();

    nextNodes.forEach((node) => {
      const isFull = classification.fullNodeIds.has(node.id);
      const isHidden = classification.hiddenNodeIds.has(node.id);
      const isMeasurement = measurementNodeIdsRef.current.has(node.id) && !isFull && !isHidden;
      nextModes.set(node.id, isMeasurement ? 'measurement' : isFull ? 'full' : 'shell');

      if (pendingFitNodeIds.has(node.id)) {
        if (nextModes.get(node.id) !== 'full' && !measurementNodeIdsRef.current.has(node.id)) {
          measurementQueueRef.current.upsert({
            nodeId: node.id,
            generation: nodeDataGenerationsRef.current.get(node.id) ?? 0,
            priority: 0
          });
        } else {
          measurementQueueRef.current.remove(node.id);
        }
        return;
      }

      if (
        classification.hiddenNodeIds.has(node.id) ||
        nextModes.get(node.id) === 'full' ||
        isDimensionReady(node) ||
        measurementNodeIdsRef.current.has(node.id)
      ) {
        measurementQueueRef.current.remove(node.id);
        return;
      }

      const priority = classification.priorities.get(node.id) ?? 2;
      // 离屏节点不预先挂载完整内容；显式 fit 仍走上面的 pendingFit 分支。
      if (priority > 1) {
        measurementQueueRef.current.remove(node.id);
        return;
      }

      measurementQueueRef.current.upsert({
        nodeId: node.id,
        generation: nodeDataGenerationsRef.current.get(node.id) ?? 0,
        priority
      });
    });

    publishRenderModes(nextModes);
    publishMeasurementNodeIds(
      new Set(
        [...measurementNodeIdsRef.current].filter(
          (nodeId) =>
            activeNodeIdsRef.current.has(nodeId) &&
            nextModes.get(nodeId) === 'measurement' &&
            !!nodeById.get(nodeId) &&
            !isDimensionReady(nodeById.get(nodeId)!)
        )
      )
    );
    scheduleMeasurementFrame();

    // 测量节点直接复用 React Flow 的节点渲染树，已挂载节点保留为 shell/full，避免测量完成时卸载。
    const desiredNodeIds = new Set([
      ...renderedGraph.renderedNodeIds,
      ...[...nextModes].filter(([, mode]) => mode === 'measurement').map(([nodeId]) => nodeId)
    ]);

    const activeNodeIds = new Set(nextNodes.map((node) => node.id));
    const retainedNodeIds = renderedNodeIdsRef.current;
    retainedNodeIds.forEach((nodeId) => {
      if (!activeNodeIds.has(nodeId) || renderedGraph.hiddenNodeIds.has(nodeId)) {
        retainedNodeIds.delete(nodeId);
      }
    });
    desiredNodeIds.forEach((nodeId) => {
      if (activeNodeIds.has(nodeId) && !renderedGraph.hiddenNodeIds.has(nodeId)) {
        retainedNodeIds.add(nodeId);
      }
    });

    const edgeById = new Map(edgesRef.current.map((edge) => [edge.id, edge]));
    const retainedEdgeIds = renderedEdgeIdsRef.current;
    retainedEdgeIds.forEach((edgeId) => {
      const edge = edgeById.get(edgeId);
      if (!edge || !retainedNodeIds.has(edge.source) || !retainedNodeIds.has(edge.target)) {
        retainedEdgeIds.delete(edgeId);
      }
    });
    renderedGraph.renderedEdgeIds.forEach((edgeId) => retainedEdgeIds.add(edgeId));

    publishRenderedGraph(
      nextNodes.filter((node) => retainedNodeIds.has(node.id)),
      edgesRef.current.filter(
        (edge) =>
          retainedEdgeIds.has(edge.id) &&
          retainedNodeIds.has(edge.source) &&
          retainedNodeIds.has(edge.target)
      )
    );
  }

  /** 合并 viewport 与拖拽位置变更，避免每个 ReactFlow 手势帧都发布 Context。 */
  function scheduleRenderStateFrame() {
    if (renderStateFrameRef.current !== undefined) return;
    renderStateFrameRef.current = scheduleFrame(() => {
      renderStateFrameRef.current = undefined;
      const nextViewport = pendingViewportRef.current;
      if (nextViewport) {
        pendingViewportRef.current = undefined;
        viewportRef.current = nextViewport;
      }
      reconcileRenderState(nodesRef.current);
      applyPendingViewportFit();
    });
  }

  const pruneDimensions = (activeNodeIds: Set<string>) => {
    focusPinnedNodeIdsRef.current.forEach((nodeId) => {
      if (!activeNodeIds.has(nodeId)) focusPinnedNodeIdsRef.current.delete(nodeId);
    });
    measurementGenerationsRef.current.forEach((_generation, nodeId) => {
      if (!activeNodeIds.has(nodeId)) {
        measurementGenerationsRef.current.delete(nodeId);
        staleDimensionNodeIdsRef.current.delete(nodeId);
        dimensionBatcher.remove(nodeId);
        measurementQueueRef.current.remove(nodeId);
      }
    });

    nodeMeasurementKeysRef.current.forEach((_identity, nodeId) => {
      if (!activeNodeIds.has(nodeId)) {
        nodeMeasurementKeysRef.current.delete(nodeId);
        nodeDataGenerationsRef.current.delete(nodeId);
        measurementQueueRef.current.remove(nodeId);
      }
    });
    newContainerIdsRef.current.forEach((nodeId) => {
      if (!activeNodeIds.has(nodeId)) newContainerIdsRef.current.delete(nodeId);
    });
    publishMeasurementNodeIds(
      new Set([...measurementNodeIdsRef.current].filter((nodeId) => activeNodeIds.has(nodeId)))
    );

    const next = new Map(nodeDimensionsRef.current);
    let changed = false;
    next.forEach((_dimension, nodeId) => {
      if (!activeNodeIds.has(nodeId)) {
        next.delete(nodeId);
        changed = true;
      }
    });

    if (changed) {
      nodeDimensionsRef.current = next;
      setNodeDimensions(next);
    }
  };

  const getNodeMeasurementKey = (node: CanvasNode) => {
    const {
      debugResult: _debugResult,
      searchedText: _searchedText,
      courseUrl: _courseUrl,
      readmeUrl: _readmeUrl,
      userGuide: _userGuide,
      isError: _isError,
      ...data
    } = node.data;
    return `${node.type}:${JSON.stringify(data)}`;
  };

  /** 仅在影响卡片布局的 data identity 变化时失效尺寸；位置和 overlay 不清空尺寸。 */
  const syncNodeIdentities = (nextNodes: CanvasNode[]) => {
    const nextKeys = new Map<string, { data: CanvasNodeData; key: string }>();
    const invalidated = new Set<string>();
    const isInitialCanvas = !initializedCanvasRef.current;

    nextNodes.forEach((node) => {
      const previousIdentity = nodeMeasurementKeysRef.current.get(node.id);
      const nextKey =
        previousIdentity?.data === node.data ? previousIdentity.key : getNodeMeasurementKey(node);
      if (!nodeMeasurementKeysRef.current.has(node.id)) {
        nodeDataGenerationsRef.current.set(node.id, 1);
        if (!isInitialCanvas && isNestedParentNodeType(node.data.flowNodeType)) {
          newContainerIdsRef.current.add(node.id);
        }
      } else if (previousIdentity?.key !== nextKey) {
        nodeDataGenerationsRef.current.set(
          node.id,
          (nodeDataGenerationsRef.current.get(node.id) ?? 0) + 1
        );
        measurementGenerationsRef.current.delete(node.id);
        dimensionBatcher.remove(node.id);
        measurementQueueRef.current.remove(node.id);
        invalidated.add(node.id);
      }
      nextKeys.set(node.id, { data: node.data, key: nextKey });
    });

    if (invalidated.size > 0) {
      invalidated.forEach((nodeId) => staleDimensionNodeIdsRef.current.add(nodeId));
      publishMeasurementNodeIds(
        new Set([...measurementNodeIdsRef.current].filter((nodeId) => !invalidated.has(nodeId)))
      );
    }

    nodeMeasurementKeysRef.current = nextKeys;
    initializedCanvasRef.current = true;
  };

  const setCanvasNodes = (next: CanvasNode[]) => {
    const activeNodeIds = new Set(next.map((node) => node.id));
    syncNodeIdentities(next);
    activeNodeIdsRef.current = activeNodeIds;
    pruneDimensions(activeNodeIds);
    const nextNodes = updateContainerLayouts(next, nodeDimensionsRef.current);
    nodesRef.current = nextNodes;
    setNodesRaw(nextNodes);
    if (renderModesRef.current.size === 0) {
      reconcileRenderState(nextNodes);
    } else {
      scheduleRenderStateFrame();
    }
  };

  const onViewportChange = useMemoizedFn((viewport: CanvasViewport) => {
    pendingViewportRef.current = viewport;
    scheduleRenderStateFrame();
  });

  const isRuntimeActive = () => !!runtime && !runtime.isDisposed();

  /** 从 Runtime 全量重投影（含 overlay 与交互状态合并）；命令被拒时也用它回滚乐观写入。 */
  const syncFromRuntime = useMemoizedFn(() => {
    if (!isRuntimeActive()) return;
    const projected = projectRuntimeCanvas({
      runtime: runtime!,
      overlays: overlaysRef.current,
      errorNodeId: issueFocusRef.current,
      localNodes: nodesRef.current,
      localEdges: edgesRef.current,
      cache: projectionCache.current
    });
    edgesRef.current = projected.edges;
    setEdgesRaw(projected.edges);
    setCanvasNodes(projected.nodes);
  });

  /**
   * 重投影的四条触发源，缺一条画布就会与数据不一致：
   * - 语义（节点/边/chatConfig 变更）与几何（位置、折叠）：直接订阅 runtime 事件。
   *   这两条只有画布需要，不再绕 host 的通用计数器，语义派生因此不会被几何提交带动。
   * - overlay 写入与标红焦点：host 的 renderer view 通道，数据存在 ref 里，靠 viewTick 失效。
   *   viewTick 变化时重挂订阅并顺带补一次投影，覆盖「文档事件先于视图数据清理」的顺序。
   */
  useEffect(() => {
    syncFromRuntime();
    return runtime
      ? runtime.subscribe((change) => {
          // 普通字段由 scoped node/field hook 消费；只有会影响画布外壳、边或位置的事件才重投影。
          if (
            change.kind === 'replace' ||
            change.kind === 'geometry' ||
            change.affectedRecords.structure ||
            change.changedRecords.edgeIds.length > 0
          ) {
            syncFromRuntime();
          }
        })
      : undefined;
  }, [syncFromRuntime, runtime, viewTick]);

  // endregion

  // region canvasCommands Canvas interaction commands and viewport controls

  const replaceNodes = useMemoizedFn((next: CanvasNode[]) => {
    const current = nodesRef.current;
    if (next === current) return;
    setCanvasNodes(next);
  });

  const replaceEdges = useMemoizedFn((next: Edge<any>[]) => {
    const current = edgesRef.current;
    if (next === current) return;
    edgesRef.current = next;
    setEdgesRaw(next);
    reconcileRenderState(nodesRef.current);
  });

  const applyNodeChanges = useMemoizedFn((changes: NodeChange[]) => {
    const prev = nodesRef.current;

    // Runtime 删除节点会级联删除后代；本地同步补全 remove 变更，避免重投影前残留一帧。
    let effectiveChanges = changes;
    const removeIds = changes
      .filter((change) => change.type === 'remove')
      .map((change) => change.id);
    if (removeIds.length > 0) {
      const removed = new Set(removeIds);
      let grew = true;
      while (grew) {
        grew = false;
        prev.forEach((node) => {
          const parentId = node.data.parentNodeId;
          if (parentId && removed.has(parentId) && !removed.has(node.id)) {
            removed.add(node.id);
            grew = true;
          }
        });
      }
      if (removed.size > removeIds.length) {
        const extra = [...removed]
          .filter((id) => !removeIds.includes(id))
          .map((id) => ({ type: 'remove' as const, id }));
        effectiveChanges = changes.concat(extra);
      }
    }

    const next = applyReactFlowNodeChanges(effectiveChanges, prev);
    if (next !== prev) {
      setCanvasNodes(next);
    }
  });

  /** 按高层 node id intent 更新选中态，调用方不需要理解 ReactFlow NodeChange。 */
  const selectNodes = useMemoizedFn((nodeIds: readonly string[]) => {
    const selectedNodeIds = new Set(nodeIds);
    const changes = nodesRef.current
      .filter((node) => node.selected !== selectedNodeIds.has(node.id))
      .map((node) => ({
        id: node.id,
        type: 'select' as const,
        selected: selectedNodeIds.has(node.id)
      }));
    if (changes.length === 0) return;

    const next = applyReactFlowNodeChanges(changes, nodesRef.current);
    if (next !== nodesRef.current) {
      setCanvasNodes(next);
    }
  });

  const applyEdgeChanges = useMemoizedFn((changes: EdgeChange[]) => {
    const prev = edgesRef.current;
    const next = applyReactFlowEdgeChanges(changes, prev);
    if (next !== prev) {
      edgesRef.current = next;
      setEdgesRaw(next);
      reconcileRenderState(nodesRef.current);
    }
  });

  const getNodes = useMemoizedFn(() => nodesRef.current);

  const getFitDimensions = () =>
    new Map(
      [...nodeDimensionsRef.current].filter(
        ([nodeId]) => !staleDimensionNodeIdsRef.current.has(nodeId)
      )
    );

  const toViewportNodes = () =>
    nodesRef.current.map((node) => ({
      id: node.id,
      position: node.position,
      parentNodeId: node.data.parentNodeId,
      isFolded: node.data.isFolded
    }));

  const applyViewportFit = (request: PendingFitRequest) => {
    const viewport = getViewportForNodeIds({
      nodes: toViewportNodes(),
      nodeIds: request.nodeIds,
      dimensions: getFitDimensions(),
      width: canvasWidth,
      height: canvasHeight,
      ...request.options
    });
    if (!viewport) return false;
    pendingFitRef.current = undefined;
    setViewport(viewport);
    return true;
  };

  const requestViewportFit = (request: PendingFitRequest) => {
    const viewportNodes = toViewportNodes();
    const fitNodeIds = getViewportFitNodeIds({
      nodes: viewportNodes,
      nodeIds: request.nodeIds
    });
    if (fitNodeIds.length === 0) {
      pendingFitRef.current = undefined;
      return false;
    }

    const missingNodeIds = getUnmeasuredViewportFitNodeIds({
      nodes: viewportNodes,
      nodeIds: request.nodeIds,
      dimensions: getFitDimensions()
    });
    if (missingNodeIds.length > 0) {
      pendingFitRef.current = request;
      reconcileRenderState(nodesRef.current);
      scheduleMeasurementFrame();
      return false;
    }

    return applyViewportFit(request);
  };

  const applyPendingViewportFit = () => {
    const request = pendingFitRef.current;
    if (request) requestViewportFit(request);
  };

  /** 直接按完整节点图和测量尺寸设置 viewport，不依赖 React Flow 当前渲染集合。 */
  const fitNodes = useMemoizedFn(
    (nodeIds?: readonly string[], options?: ViewportFitOptions): boolean => {
      return requestViewportFit({
        nodeIds: nodeIds ? [...nodeIds] : undefined,
        options: options ? { ...options } : undefined
      });
    }
  );
  const getNodeDimension = useMemoizedFn(
    (nodeId: string) => nodeDimensionsRef.current.get(nodeId)?.card
  );
  const getNodeDimensions = useMemoizedFn((nodeId: string) =>
    nodeDimensionsRef.current.get(nodeId)
  );
  const registerNodeMeasurement = useMemoizedFn((nodeId: string): DimensionRegistration => {
    const generation = ++nextMeasurementGenerationRef.current;
    const nodeGeneration = nodeDataGenerationsRef.current.get(nodeId);
    measurementGenerationsRef.current.set(nodeId, generation);

    const report = (dimension: NodeDimensions) => {
      if (
        !activeNodeIdsRef.current.has(nodeId) ||
        measurementGenerationsRef.current.get(nodeId) !== generation ||
        nodeDataGenerationsRef.current.get(nodeId) !== nodeGeneration
      ) {
        return;
      }
      dimensionBatcher.enqueue({ nodeId, generation, dimension });
    };

    const dispose = () => {
      if (measurementGenerationsRef.current.get(nodeId) !== generation) return;
      measurementGenerationsRef.current.delete(nodeId);
      dimensionBatcher.remove(nodeId);
    };

    return { report, dispose };
  });

  const pinNodeFocus = useMemoizedFn((nodeId: string) => {
    if (focusPinnedNodeIdsRef.current.has(nodeId)) return;
    focusPinnedNodeIdsRef.current.add(nodeId);
    reconcileRenderState(nodesRef.current);
  });

  const unpinNodeFocus = useMemoizedFn((nodeId: string) => {
    if (!focusPinnedNodeIdsRef.current.delete(nodeId)) return;
    reconcileRenderState(nodesRef.current);
  });

  useEffect(
    () => () => {
      dimensionBatcher.dispose();
      measurementQueueRef.current.clear();
      if (renderStateFrameRef.current !== undefined) cancelFrame(renderStateFrameRef.current);
      if (measurementFrameRef.current !== undefined) cancelFrame(measurementFrameRef.current);
    },
    [dimensionBatcher]
  );

  // endregion

  // region canvasAssembly Canvas context assembly

  const contextValue = useMemo(
    () => ({
      fitNodes,
      nodeDimensions,
      containerLayouts,
      getNodeDimension,
      getNodeDimensions,
      registerNodeMeasurement,
      pinNodeFocus,
      unpinNodeFocus,
      renderModes,
      measurementNodeIds
    }),
    [
      fitNodes,
      nodeDimensions,
      containerLayouts,
      getNodeDimension,
      getNodeDimensions,
      registerNodeMeasurement,
      pinNodeFocus,
      unpinNodeFocus,
      renderModes,
      measurementNodeIds
    ]
  );

  const rendererContextValue = useMemo(
    () => ({
      nodes,
      renderedNodes,
      replaceNodes,
      applyNodeChanges,
      selectNodes,
      getNodes,
      edges,
      renderedEdges,
      replaceEdges,
      applyEdgeChanges,
      onViewportChange
    }),
    [
      nodes,
      renderedNodes,
      replaceNodes,
      applyNodeChanges,
      selectNodes,
      getNodes,
      edges,
      renderedEdges,
      replaceEdges,
      applyEdgeChanges,
      onViewportChange
    ]
  );

  return (
    <WorkflowCanvasContext.Provider value={contextValue}>
      <WorkflowCanvasRendererContext.Provider value={rendererContextValue}>
        {children}
      </WorkflowCanvasRendererContext.Provider>
    </WorkflowCanvasContext.Provider>
  );

  // endregion
};

export default WorkflowCanvasProvider;

// endregion
