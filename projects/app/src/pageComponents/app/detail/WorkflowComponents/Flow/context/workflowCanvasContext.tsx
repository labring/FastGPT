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
  applyNodeChanges
} from 'reactflow';
import { WorkflowHostContext } from '@/web/core/workflow/editor/host';
import { createProjectionCache, projectRuntimeCanvas } from '@/web/core/workflow/editor/projection';
import type { CanvasNode } from '@/web/core/workflow/editor/canvas';
import {
  createDimensionBatcher,
  type DimensionMeasurement,
  type DimensionRegistration,
  type NodeCardDimension
} from './dimensionIndex';

type OnChange<ChangesType> = (changes: ChangesType[]) => void;

type WorkflowCanvasContextType = {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  setNodes: Dispatch<SetStateAction<Node<FlowNodeItemType, string | undefined>[]>>;
  onNodesChange: OnChange<NodeChange>;
  getNodes: () => Node<FlowNodeItemType, string | undefined>[];
  dimensionIndex: ReadonlyMap<string, NodeCardDimension>;
  getNodeDimension: (nodeId: string) => NodeCardDimension | undefined;
  registerNodeMeasurement: (nodeId: string) => DimensionRegistration;
  edges: Edge<any>[];
  setEdges: Dispatch<SetStateAction<Edge<any>[]>>;
  onEdgesChange: OnChange<EdgeChange>;
};
export const WorkflowCanvasContext = createContext<WorkflowCanvasContextType>({
  nodes: [],
  setNodes: function () {
    throw new Error('Function not implemented.');
  },
  onNodesChange: function () {
    throw new Error('Function not implemented.');
  },
  getNodes: function () {
    throw new Error('Function not implemented.');
  },
  dimensionIndex: new Map(),
  getNodeDimension: function () {
    throw new Error('Function not implemented.');
  },
  registerNodeMeasurement: function () {
    throw new Error('Function not implemented.');
  },
  edges: [],
  setEdges: function () {
    throw new Error('Function not implemented.');
  },
  onEdgesChange: function () {
    throw new Error('Function not implemented.');
  }
});

const WorkflowCanvasProvider = ({ children }: { children: ReactNode }) => {
  const runtime = useContextSelector(WorkflowHostContext, (v) => v.runtime);
  const viewTick = useContextSelector(WorkflowHostContext, (v) => v.viewTick);
  const overlaysRef = useContextSelector(WorkflowHostContext, (v) => v.overlaysRef);
  // 标红焦点归 host：投影时合并，画布数组不再是问题状态的写入方。
  const issueFocusRef = useContextSelector(WorkflowHostContext, (v) => v.issueFocusRef);

  // 交互状态层：reactflow 本地数组，语义值以 Runtime 投影为准。
  const [nodes, setNodesRaw] = useState<CanvasNode[]>([]);
  const [edges, setEdgesRaw] = useState<Edge<any>[]>([]);
  // ref 与本地数组同步更新，保证同一 tick 内连续写入（先删节点再删边等）读到最新值。
  const nodesRef = useRef<CanvasNode[]>(nodes);
  const edgesRef = useRef<Edge<any>[]>(edges);
  const projectionCache = useRef(createProjectionCache());
  const [dimensionIndex, setDimensionIndex] = useState<ReadonlyMap<string, NodeCardDimension>>(
    () => new Map()
  );
  const dimensionIndexRef = useRef(new Map<string, NodeCardDimension>());
  const activeNodeIdsRef = useRef(new Set(nodes.map((node) => node.id)));
  const measurementGenerationsRef = useRef(new Map<string, number>());
  const nextMeasurementGenerationRef = useRef(0);
  const flushDimensionMeasurements = useMemoizedFn((updates: DimensionMeasurement[]) => {
    const next = new Map(dimensionIndexRef.current);
    let changed = false;

    updates.forEach((update) => {
      if (
        !activeNodeIdsRef.current.has(update.nodeId) ||
        measurementGenerationsRef.current.get(update.nodeId) !== update.generation
      ) {
        return;
      }

      const previous = next.get(update.nodeId);
      if (
        previous?.width === update.dimension.width &&
        previous?.height === update.dimension.height
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
  });
  const [dimensionBatcher] = useState(() =>
    createDimensionBatcher({ onFlush: flushDimensionMeasurements })
  );

  const pruneDimensions = (activeNodeIds: Set<string>) => {
    measurementGenerationsRef.current.forEach((_generation, nodeId) => {
      if (!activeNodeIds.has(nodeId)) {
        measurementGenerationsRef.current.delete(nodeId);
        dimensionBatcher.remove(nodeId);
      }
    });

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

  const setRenderedNodes = (next: CanvasNode[]) => {
    const activeNodeIds = new Set(next.map((node) => node.id));
    activeNodeIdsRef.current = activeNodeIds;
    pruneDimensions(activeNodeIds);
    nodesRef.current = next;
    setNodesRaw(next);
  };

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
    setRenderedNodes(projected.nodes);
    edgesRef.current = projected.edges;
    setEdgesRaw(projected.edges);
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
    setRenderedNodes(next);
  });

  const setEdges = useMemoizedFn((action: SetStateAction<Edge<any>[]>) => {
    const current = edgesRef.current;
    const next = typeof action === 'function' ? action(current) : action;
    if (next === current) return;
    edgesRef.current = next;
    setEdgesRaw(next);
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
      setRenderedNodes(next);
    }
  });

  const onEdgesChange = useMemoizedFn((changes: EdgeChange[]) => {
    const prev = edgesRef.current;
    const next = applyEdgeChanges(changes, prev);
    if (next !== prev) {
      edgesRef.current = next;
      setEdgesRaw(next);
    }
  });

  const getNodes = useMemoizedFn(() => nodesRef.current);
  const getNodeDimension = useMemoizedFn((nodeId: string) => dimensionIndexRef.current.get(nodeId));

  const registerNodeMeasurement = useMemoizedFn((nodeId: string): DimensionRegistration => {
    const generation = ++nextMeasurementGenerationRef.current;
    measurementGenerationsRef.current.set(nodeId, generation);

    const report = (dimension: NodeCardDimension) => {
      if (measurementGenerationsRef.current.get(nodeId) !== generation) return;
      dimensionBatcher.enqueue({ nodeId, generation, dimension });
    };

    const dispose = () => {
      if (measurementGenerationsRef.current.get(nodeId) !== generation) return;
      measurementGenerationsRef.current.delete(nodeId);
      dimensionBatcher.remove(nodeId);

      const current = dimensionIndexRef.current;
      if (!current.has(nodeId)) return;
      const next = new Map(current);
      next.delete(nodeId);
      dimensionIndexRef.current = next;
      setDimensionIndex(next);
    };

    return { report, dispose };
  });

  useEffect(() => () => dimensionBatcher.dispose(), [dimensionBatcher]);

  const contextValue = useMemo(
    () => ({
      nodes,
      setNodes,
      onNodesChange,
      getNodes,
      dimensionIndex,
      getNodeDimension,
      registerNodeMeasurement,
      edges,
      setEdges,
      onEdgesChange
    }),
    [
      nodes,
      setNodes,
      onNodesChange,
      getNodes,
      dimensionIndex,
      getNodeDimension,
      registerNodeMeasurement,
      edges,
      setEdges,
      onEdgesChange
    ]
  );

  return (
    <WorkflowCanvasContext.Provider value={contextValue}>{children}</WorkflowCanvasContext.Provider>
  );
};

export default WorkflowCanvasProvider;
