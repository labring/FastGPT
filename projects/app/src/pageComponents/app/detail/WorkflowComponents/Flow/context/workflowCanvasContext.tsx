// Renderer canvas state: projection data plus ReactFlow interaction state.
// Runtime 拥有唯一的 Workflow Document / Node View；派生索引直接读 Runtime 结构快照与
// 节点视图，画布数组只承载 reactflow 交互状态（拖拽帧、测量尺寸、层级）。
// 结构、几何与边写入由调用点直接使用 editor adapter 提交。
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { createContext, useContextSelector } from 'use-context-selector';

import { useMemoizedFn } from 'ahooks';
import React, {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  useStore
} from 'reactflow';
import { WorkflowHostContext } from '@/web/core/workflow/editor/host';
import { createProjectionCache, projectRuntimeCanvas } from '@/web/core/workflow/editor/projection';
import type { CanvasNode } from '@/web/core/workflow/editor/canvas';
import {
  classifyRenderableGraph,
  createMeasurementQueue,
  createDimensionBatcher,
  type CanvasViewport,
  type DimensionMeasurement,
  type DimensionRegistration,
  type NodeDimensions,
  type NodeCardDimension,
  getViewportForNodeIds,
  type ViewportFitOptions
} from './dimensionIndex';

type OnChange<ChangesType> = (changes: ChangesType[]) => void;

export type WorkflowRenderMode = 'full' | 'shell';

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

type WorkflowCanvasContextType = {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  renderedNodes: Node<FlowNodeItemType, string | undefined>[];
  setNodes: Dispatch<SetStateAction<Node<FlowNodeItemType, string | undefined>[]>>;
  onNodesChange: OnChange<NodeChange>;
  getNodes: () => Node<FlowNodeItemType, string | undefined>[];
  fitNodes: (nodeIds?: readonly string[], options?: ViewportFitOptions) => boolean;
  dimensionIndex: ReadonlyMap<string, NodeDimensions>;
  getNodeDimension: (nodeId: string) => NodeCardDimension | undefined;
  getNodeDimensions: (nodeId: string) => NodeDimensions | undefined;
  registerNodeMeasurement: (nodeId: string) => DimensionRegistration;
  pinNodeFocus: (nodeId: string) => void;
  unpinNodeFocus: (nodeId: string) => void;
  renderModes: ReadonlyMap<string, WorkflowRenderMode>;
  measurementNodeIds: readonly string[];
  onViewportChange: (viewport: CanvasViewport) => void;
  edges: Edge<any>[];
  renderedEdges: Edge<any>[];
  setEdges: Dispatch<SetStateAction<Edge<any>[]>>;
  onEdgesChange: OnChange<EdgeChange>;
};
export const WorkflowCanvasContext = createContext<WorkflowCanvasContextType>({
  nodes: [],
  renderedNodes: [],
  setNodes: function () {
    throw new Error('Function not implemented.');
  },
  onNodesChange: function () {
    throw new Error('Function not implemented.');
  },
  getNodes: function () {
    throw new Error('Function not implemented.');
  },
  fitNodes: function () {
    throw new Error('Function not implemented.');
  },
  dimensionIndex: new Map(),
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
  measurementNodeIds: [],
  onViewportChange: function () {
    throw new Error('Function not implemented.');
  },
  edges: [],
  renderedEdges: [],
  setEdges: function () {
    throw new Error('Function not implemented.');
  },
  onEdgesChange: function () {
    throw new Error('Function not implemented.');
  }
});

const WorkflowCanvasProvider = ({ children }: { children: ReactNode }) => {
  const { setViewport } = useReactFlow();
  const canvasWidth = useStore((state) => state.width);
  const canvasHeight = useStore((state) => state.height);
  const runtime = useContextSelector(WorkflowHostContext, (v) => v.runtime);
  const viewTick = useContextSelector(WorkflowHostContext, (v) => v.viewTick);
  const overlaysRef = useContextSelector(WorkflowHostContext, (v) => v.overlaysRef);
  // 标红焦点归 host：投影时合并，画布数组不再是问题状态的写入方。
  const issueFocusRef = useContextSelector(WorkflowHostContext, (v) => v.issueFocusRef);

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
  const projectionCache = useRef(createProjectionCache());
  const [dimensionIndex, setDimensionIndex] = useState<ReadonlyMap<string, NodeDimensions>>(
    () => new Map()
  );
  const dimensionIndexRef = useRef(new Map<string, NodeDimensions>());
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
  const nodeMeasurementKeysRef = useRef(new Map<string, { data: FlowNodeItemType; key: string }>());
  const nodeDataGenerationsRef = useRef(new Map<string, number>());
  const measurementGenerationsRef = useRef(new Map<string, number>());
  const nextMeasurementGenerationRef = useRef(0);
  const focusPinnedNodeIdsRef = useRef(new Set<string>());
  const staleDimensionNodeIdsRef = useRef(new Set<string>());

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

  const flushDimensionMeasurements = useMemoizedFn((updates: DimensionMeasurement[]) => {
    const next = new Map(dimensionIndexRef.current);
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
        previous?.occupied.height === update.dimension.occupied.height
      ) {
        return;
      }

      next.set(update.nodeId, update.dimension);
      changed = true;
    });

    if (changed) {
      dimensionIndexRef.current = next;
      setDimensionIndex(next);
    }

    if (completed.size > 0) {
      publishMeasurementNodeIds(
        new Set([...measurementNodeIdsRef.current].filter((nodeId) => !completed.has(nodeId)))
      );
      reconcileRenderState(nodesRef.current);
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
      }

      if (measurementQueueRef.current.getSize() > 0) scheduleMeasurementFrame();
    });
  }

  /** 根据当前 viewport 重算 full/shell，并把未测量节点按优先级放入队列。 */
  function reconcileRenderState(nextNodes: CanvasNode[]) {
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
      dimensions: dimensionIndexRef.current,
      viewport: viewportRef.current
    });
    const classification = renderedGraph;
    const nextModes = new Map<string, WorkflowRenderMode>();

    nextNodes.forEach((node) => {
      nextModes.set(node.id, classification.fullNodeIds.has(node.id) ? 'full' : 'shell');

      if (
        classification.hiddenNodeIds.has(node.id) ||
        (dimensionIndexRef.current.has(node.id) &&
          !staleDimensionNodeIdsRef.current.has(node.id)) ||
        measurementNodeIdsRef.current.has(node.id)
      ) {
        measurementQueueRef.current.remove(node.id);
        return;
      }

      measurementQueueRef.current.upsert({
        nodeId: node.id,
        generation: nodeDataGenerationsRef.current.get(node.id) ?? 0,
        priority: classification.priorities.get(node.id) ?? 2
      });
    });

    publishRenderModes(nextModes);
    publishMeasurementNodeIds(
      new Set(
        [...measurementNodeIdsRef.current].filter(
          (nodeId) =>
            activeNodeIdsRef.current.has(nodeId) &&
            nextModes.get(nodeId) === 'shell' &&
            (!dimensionIndexRef.current.has(nodeId) || staleDimensionNodeIdsRef.current.has(nodeId))
        )
      )
    );
    scheduleMeasurementFrame();

    const renderedNodeIds = renderedGraph.renderedNodeIds;
    publishRenderedGraph(
      nextNodes.filter((node) => renderedNodeIds.has(node.id)),
      edgesRef.current.filter(
        (edge) =>
          renderedGraph.renderedEdgeIds.has(edge.id) &&
          renderedNodeIds.has(edge.source) &&
          renderedNodeIds.has(edge.target)
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
    publishMeasurementNodeIds(
      new Set([...measurementNodeIdsRef.current].filter((nodeId) => activeNodeIds.has(nodeId)))
    );

    const next = new Map(dimensionIndexRef.current);
    let changed = false;
    next.forEach((_dimension, nodeId) => {
      if (!activeNodeIds.has(nodeId)) {
        next.delete(nodeId);
        changed = true;
      }
    });

    if (changed) {
      dimensionIndexRef.current = next;
      setDimensionIndex(next);
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
    const nextKeys = new Map<string, { data: FlowNodeItemType; key: string }>();
    const invalidated = new Set<string>();

    nextNodes.forEach((node) => {
      const previousIdentity = nodeMeasurementKeysRef.current.get(node.id);
      const nextKey =
        previousIdentity?.data === node.data ? previousIdentity.key : getNodeMeasurementKey(node);
      if (!nodeMeasurementKeysRef.current.has(node.id)) {
        nodeDataGenerationsRef.current.set(node.id, 1);
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
  };

  const setCanvasNodes = (next: CanvasNode[]) => {
    const activeNodeIds = new Set(next.map((node) => node.id));
    syncNodeIdentities(next);
    activeNodeIdsRef.current = activeNodeIds;
    pruneDimensions(activeNodeIds);
    nodesRef.current = next;
    setNodesRaw(next);
    if (renderModesRef.current.size === 0) {
      reconcileRenderState(next);
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
    return runtime ? runtime.subscribe(syncFromRuntime) : undefined;
  }, [syncFromRuntime, runtime, viewTick]);

  const setNodes = useMemoizedFn((action: SetStateAction<CanvasNode[]>) => {
    const current = nodesRef.current;
    const next = typeof action === 'function' ? action(current) : action;
    if (next === current) return;
    setCanvasNodes(next);
  });

  const setEdges = useMemoizedFn((action: SetStateAction<Edge<any>[]>) => {
    const current = edgesRef.current;
    const next = typeof action === 'function' ? action(current) : action;
    if (next === current) return;
    edgesRef.current = next;
    setEdgesRaw(next);
    reconcileRenderState(nodesRef.current);
  });

  const onNodesChange = useMemoizedFn((changes: NodeChange[]) => {
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

    const next = applyNodeChanges(effectiveChanges, prev);
    if (next !== prev) {
      setCanvasNodes(next);
    }
  });

  const onEdgesChange = useMemoizedFn((changes: EdgeChange[]) => {
    const prev = edgesRef.current;
    const next = applyEdgeChanges(changes, prev);
    if (next !== prev) {
      edgesRef.current = next;
      setEdgesRaw(next);
      reconcileRenderState(nodesRef.current);
    }
  });

  const getNodes = useMemoizedFn(() => nodesRef.current);
  /** 直接按完整节点图和测量尺寸设置 viewport，不依赖 React Flow 当前渲染集合。 */
  const fitNodes = useMemoizedFn(
    (nodeIds?: readonly string[], options?: ViewportFitOptions): boolean => {
      const viewport = getViewportForNodeIds({
        nodes: nodesRef.current.map((node) => ({
          id: node.id,
          position: node.position,
          parentNodeId: node.data.parentNodeId,
          isFolded: node.data.isFolded
        })),
        nodeIds,
        dimensions: dimensionIndexRef.current,
        width: canvasWidth,
        height: canvasHeight,
        ...options
      });
      if (!viewport) return false;
      setViewport(viewport);
      return true;
    }
  );
  const getNodeDimension = useMemoizedFn(
    (nodeId: string) => dimensionIndexRef.current.get(nodeId)?.card
  );
  const getNodeDimensions = useMemoizedFn((nodeId: string) =>
    dimensionIndexRef.current.get(nodeId)
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

  const contextValue = useMemo(
    () => ({
      nodes,
      renderedNodes,
      setNodes,
      onNodesChange,
      getNodes,
      fitNodes,
      dimensionIndex,
      getNodeDimension,
      getNodeDimensions,
      registerNodeMeasurement,
      pinNodeFocus,
      unpinNodeFocus,
      renderModes,
      measurementNodeIds,
      onViewportChange,
      edges,
      renderedEdges,
      setEdges,
      onEdgesChange
    }),
    [
      nodes,
      renderedNodes,
      setNodes,
      onNodesChange,
      getNodes,
      fitNodes,
      dimensionIndex,
      getNodeDimension,
      getNodeDimensions,
      registerNodeMeasurement,
      pinNodeFocus,
      unpinNodeFocus,
      renderModes,
      measurementNodeIds,
      onViewportChange,
      edges,
      renderedEdges,
      setEdges,
      onEdgesChange
    ]
  );

  return (
    <WorkflowCanvasContext.Provider value={contextValue}>{children}</WorkflowCanvasContext.Provider>
  );
};

export default WorkflowCanvasProvider;
