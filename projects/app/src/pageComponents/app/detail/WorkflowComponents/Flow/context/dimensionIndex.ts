export type NodeCardDimension = {
  width: number;
  height: number;
};

/** 读取未受 ReactFlow viewport transform 影响的布局尺寸，单位是画布 CSS 像素。 */
export const getLayoutDimension = (
  element: Pick<HTMLElement, 'offsetWidth' | 'offsetHeight'>
): NodeCardDimension => ({
  width: element.offsetWidth,
  height: element.offsetHeight
});

export type NodeDimensions = {
  card: NodeCardDimension;
  occupied: NodeCardDimension;
};

export type DimensionReader = (nodeId: string) => NodeCardDimension | undefined;

export type NodeRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export type CanvasViewport = {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
};

export type ViewportNode = {
  id: string;
  position: { x: number; y: number };
  parentNodeId?: string;
  isFolded?: boolean;
  selected?: boolean;
  dragging?: boolean;
  focusPinned?: boolean;
};

export type ViewportNodeClassification = {
  visibleNodeIds: ReadonlySet<string>;
  overscanNodeIds: ReadonlySet<string>;
  fullNodeIds: ReadonlySet<string>;
  hiddenNodeIds: ReadonlySet<string>;
  priorities: ReadonlyMap<string, 0 | 1 | 2>;
};

export type ViewportEdge = {
  id: string;
  source: string;
  target: string;
};

export type RenderableGraphClassification = ViewportNodeClassification & {
  renderedNodeIds: ReadonlySet<string>;
  renderedEdgeIds: ReadonlySet<string>;
};

export const WORKFLOW_VIEWPORT_OVERSCAN = 240;
export const WORKFLOW_NODE_MEASUREMENT_ESTIMATE: NodeDimensions = {
  card: { width: 300, height: 120 },
  occupied: { width: 300, height: 120 }
};

/**
 * 把屏幕像素 overscan 转成画布坐标范围；尺寸估算只服务裁剪，不写入 Dimension Index。
 */
export const getViewportRange = ({
  viewport,
  overscan = WORKFLOW_VIEWPORT_OVERSCAN
}: {
  viewport: CanvasViewport;
  overscan?: number;
}): NodeRect => {
  const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;
  const left = (-viewport.x - overscan) / zoom;
  const top = (-viewport.y - overscan) / zoom;
  const right = (viewport.width - viewport.x + overscan) / zoom;
  const bottom = (viewport.height - viewport.y + overscan) / zoom;
  const width = Math.max(right - left, 0);
  const height = Math.max(bottom - top, 0);

  return {
    left,
    right,
    top,
    bottom,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2
  };
};

const getAbsoluteNodePositions = (nodes: readonly ViewportNode[]) => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const positionById = new Map<string, { x: number; y: number }>();

  function getAbsolutePosition(
    nodeId: string,
    visiting = new Set<string>()
  ): { x: number; y: number } {
    const cached = positionById.get(nodeId);
    if (cached) return cached;

    const node = nodeById.get(nodeId);
    if (!node) return { x: 0, y: 0 };
    if (visiting.has(nodeId)) return node.position;

    const nextVisiting = new Set(visiting).add(nodeId);
    const parent = node.parentNodeId ? nodeById.get(node.parentNodeId) : undefined;
    const parentPosition = parent
      ? getAbsolutePosition(parent.id, nextVisiting)
      : {
          x: 0,
          y: 0
        };
    const position = {
      x: node.position.x + parentPosition.x,
      y: node.position.y + parentPosition.y
    };
    positionById.set(nodeId, position);
    return position;
  }

  nodes.forEach((node) => getAbsolutePosition(node.id));
  return { nodeById, positionById };
};

/**
 * 计算 viewport/overscan 集合。安全区内节点直接进入 full，容器因安全区内子节点被加入 full 集合。
 * 折叠子节点不进入测量队列。
 */
type ClassifyViewportNodesParams = {
  nodes: readonly ViewportNode[];
  dimensions: ReadonlyMap<string, NodeDimensions>;
  viewport: CanvasViewport;
  overscan?: number;
  estimate?: NodeDimensions;
};

const classifyViewportNodesWithPositions = ({
  nodes,
  dimensions,
  viewport,
  overscan = WORKFLOW_VIEWPORT_OVERSCAN,
  estimate = WORKFLOW_NODE_MEASUREMENT_ESTIMATE
}: ClassifyViewportNodesParams) => {
  const { nodeById, positionById } = getAbsoluteNodePositions(nodes);
  const hiddenNodeIds = new Set<string>();
  const visibleNodeIds = new Set<string>();
  const overscanNodeIds = new Set<string>();
  const fullNodeIds = new Set<string>();
  const priorities = new Map<string, 0 | 1 | 2>();
  const range = getViewportRange({ viewport, overscan });
  const viewportRange = getViewportRange({ viewport, overscan: 0 });

  const isHiddenByFold = (node: ViewportNode) => {
    const visited = new Set<string>();
    let parentId = node.parentNodeId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = nodeById.get(parentId);
      if (!parent) return false;
      if (parent.isFolded) return true;
      parentId = parent.parentNodeId;
    }
    return false;
  };

  nodes.forEach((node) => {
    if (isHiddenByFold(node)) {
      hiddenNodeIds.add(node.id);
      return;
    }

    const position = positionById.get(node.id) ?? node.position;
    const dimension = dimensions.get(node.id) ?? estimate;
    const rect = getNodeRect({ id: node.id, position }, dimension.occupied);
    if (!rect) return;

    const isVisible = areNodeRectsIntersecting(rect, range);
    const isInViewport = areNodeRectsIntersecting(rect, viewportRange);

    if (isInViewport) {
      visibleNodeIds.add(node.id);
      fullNodeIds.add(node.id);
      priorities.set(node.id, 0);
    } else if (isVisible) {
      overscanNodeIds.add(node.id);
      fullNodeIds.add(node.id);
      priorities.set(node.id, 1);
    } else {
      priorities.set(node.id, 2);
    }

    if (node.selected || node.dragging || node.focusPinned) fullNodeIds.add(node.id);
  });

  new Set([...visibleNodeIds, ...overscanNodeIds]).forEach((nodeId) => {
    let parentId = nodeById.get(nodeId)?.parentNodeId;
    while (parentId) {
      fullNodeIds.add(parentId);
      parentId = nodeById.get(parentId)?.parentNodeId;
    }
  });

  return {
    classification: {
      visibleNodeIds,
      overscanNodeIds,
      fullNodeIds,
      hiddenNodeIds,
      priorities
    },
    nodeById,
    positionById
  };
};

export const classifyViewportNodes = (
  params: ClassifyViewportNodesParams
): ViewportNodeClassification => classifyViewportNodesWithPositions(params).classification;

const getRectBounds = (rects: readonly NodeRect[]): NodeRect | undefined => {
  if (rects.length === 0) return;

  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const width = right - left;
  const height = bottom - top;

  return {
    left,
    right,
    top,
    bottom,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2
  };
};

/** 计算交给 React Flow 的节点与边集合；完整图仍由 Canvas Context 保留。 */
export const classifyRenderableGraph = ({
  nodes,
  edges,
  dimensions,
  viewport,
  overscan = WORKFLOW_VIEWPORT_OVERSCAN,
  estimate = WORKFLOW_NODE_MEASUREMENT_ESTIMATE
}: {
  nodes: readonly ViewportNode[];
  edges: readonly ViewportEdge[];
  dimensions: ReadonlyMap<string, NodeDimensions>;
  viewport: CanvasViewport;
  overscan?: number;
  estimate?: NodeDimensions;
}): RenderableGraphClassification => {
  const { classification, nodeById, positionById } = classifyViewportNodesWithPositions({
    nodes,
    dimensions,
    viewport,
    overscan,
    estimate
  });
  const safeRange = getViewportRange({ viewport, overscan });
  const renderedNodeIds = new Set<string>(classification.visibleNodeIds);
  const fullNodeIds = new Set<string>(classification.fullNodeIds);
  const renderedEdgeIds = new Set<string>();
  const childrenByParent = new Map<string, string[]>();
  const visibleContainerIds = new Set<string>();

  nodes.forEach((node) => {
    if (node.parentNodeId) {
      const children = childrenByParent.get(node.parentNodeId) ?? [];
      children.push(node.id);
      childrenByParent.set(node.parentNodeId, children);
    }

    if (
      !classification.hiddenNodeIds.has(node.id) &&
      (node.selected || node.dragging || node.focusPinned)
    ) {
      renderedNodeIds.add(node.id);
    }
  });

  nodes.forEach((node) => {
    if (
      classification.visibleNodeIds.has(node.id) &&
      !node.isFolded &&
      childrenByParent.has(node.id)
    ) {
      visibleContainerIds.add(node.id);
    }
  });

  const addDescendants = (nodeId: string) => {
    childrenByParent.get(nodeId)?.forEach((childId) => {
      if (classification.hiddenNodeIds.has(childId)) return;
      renderedNodeIds.add(childId);
      fullNodeIds.add(childId);
      addDescendants(childId);
    });
  };
  visibleContainerIds.forEach((nodeId) => {
    renderedNodeIds.add(nodeId);
    addDescendants(nodeId);
  });

  const addAncestors = (nodeId: string) => {
    let parentId = nodeById.get(nodeId)?.parentNodeId;
    while (parentId) {
      if (classification.hiddenNodeIds.has(parentId)) break;
      renderedNodeIds.add(parentId);
      parentId = nodeById.get(parentId)?.parentNodeId;
    }
  };
  [...renderedNodeIds].forEach(addAncestors);

  const rectById = new Map<string, NodeRect>();
  nodes.forEach((node) => {
    if (classification.hiddenNodeIds.has(node.id)) return;
    const position = positionById.get(node.id) ?? node.position;
    const dimension = dimensions.get(node.id) ?? estimate;
    const rect = getNodeRect({ id: node.id, position }, dimension.occupied);
    if (rect) rectById.set(node.id, rect);
  });

  edges.forEach((edge) => {
    const sourceRect = rectById.get(edge.source);
    const targetRect = rectById.get(edge.target);
    if (!sourceRect || !targetRect) return;

    const edgeBounds = getRectBounds([sourceRect, targetRect]);
    const touchesViewport =
      classification.visibleNodeIds.has(edge.source) ||
      classification.visibleNodeIds.has(edge.target);
    const crossesSafeRange = edgeBounds ? areNodeRectsIntersecting(edgeBounds, safeRange) : false;
    const insideVisibleContainer =
      visibleContainerIds.has(edge.source) && visibleContainerIds.has(edge.target);

    if (!touchesViewport && !crossesSafeRange && !insideVisibleContainer) return;
    renderedEdgeIds.add(edge.id);
    renderedNodeIds.add(edge.source);
    renderedNodeIds.add(edge.target);
  });

  [...renderedNodeIds].forEach(addAncestors);

  return {
    ...classification,
    fullNodeIds,
    renderedNodeIds,
    renderedEdgeIds
  };
};

export type MeasurementQueueEntry = {
  nodeId: string;
  generation: number;
  priority: 0 | 1 | 2;
};

export type MeasurementQueue = {
  upsert: (entry: MeasurementQueueEntry) => void;
  take: (
    limit: number,
    shouldTake?: (entry: MeasurementQueueEntry) => boolean
  ) => MeasurementQueueEntry[];
  remove: (nodeId: string) => void;
  clear: () => void;
  getSize: () => number;
};

/** 小型优先队列：同一节点只保留最新 generation，取出后由 host 负责挂载生命周期。 */
export const createMeasurementQueue = (): MeasurementQueue => {
  const pending = new Map<string, MeasurementQueueEntry>();

  const upsert = (entry: MeasurementQueueEntry) => {
    const previous = pending.get(entry.nodeId);
    if (previous && previous.generation > entry.generation) return;
    pending.set(entry.nodeId, entry);
  };

  const take = (
    limit: number,
    shouldTake: (entry: MeasurementQueueEntry) => boolean = () => true
  ) => {
    if (limit <= 0 || pending.size === 0) return [];

    const entries = [...pending.values()].sort((left, right) => left.priority - right.priority);
    const result: MeasurementQueueEntry[] = [];
    entries.forEach((entry) => {
      if (!shouldTake(entry)) {
        pending.delete(entry.nodeId);
        return;
      }
      if (result.length >= limit) return;
      pending.delete(entry.nodeId);
      result.push(entry);
    });
    return result;
  };

  return {
    upsert,
    take,
    remove: (nodeId) => pending.delete(nodeId),
    clear: () => pending.clear(),
    getSize: () => pending.size
  };
};

type PositionedNode = {
  id: string;
  position: { x: number; y: number };
};

export type DimensionMeasurement = {
  nodeId: string;
  generation: number;
  dimension: NodeDimensions;
};

export type DimensionFrameScheduler = {
  schedule: (callback: () => void) => number;
  cancel: (handle: number) => void;
};

export type DimensionRegistration = {
  report: (dimension: NodeDimensions) => void;
  dispose: () => void;
};

type DimensionBatcher = {
  enqueue: (measurement: DimensionMeasurement) => void;
  remove: (nodeId: string) => void;
  dispose: () => void;
};

/** 从 renderer 尺寸索引生成节点矩形；没有测量结果就不参与几何计算。 */
export const getNodeRect = (
  node: PositionedNode,
  dimension: NodeCardDimension | undefined
): NodeRect | undefined => {
  if (!dimension) return;

  const { width, height } = dimension;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
    return;
  }

  const { x, y } = node.position;
  return {
    left: x,
    right: x + width,
    top: y,
    bottom: y + height,
    width,
    height,
    centerX: x + width / 2,
    centerY: y + height / 2
  };
};

/** 判断两个节点卡片矩形是否有实际面积交集。 */
export const areNodeRectsIntersecting = (left: NodeRect, right: NodeRect) =>
  left.left < right.right &&
  left.right > right.left &&
  left.top < right.bottom &&
  left.bottom > right.top;

/** 给 ReactFlow 兼容接口附上已确认的 renderer 尺寸；尺寸来源仍是 Dimension Index。 */
export const withNodeDimension = <T extends { id: string }>(
  node: T,
  dimension: NodeCardDimension
): T & NodeCardDimension => ({
  ...node,
  width: dimension.width,
  height: dimension.height
});

/** 过滤掉尚未测量的节点，供 fitView 等只接受完整矩形的 API 使用。 */
export const getDimensionedNodes = <T extends { id: string }>(
  nodes: readonly T[],
  getDimension: DimensionReader
): Array<T & NodeCardDimension> =>
  nodes.flatMap((node) => {
    const dimension = getDimension(node.id);
    return dimension ? [withNodeDimension(node, dimension)] : [];
  });

const defaultScheduler: DimensionFrameScheduler = {
  schedule: (callback) => {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
    return setTimeout(callback, 0) as unknown as number;
  },
  cancel: (handle) => {
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(handle);
      return;
    }
    clearTimeout(handle);
  }
};

const normalizeDimension = (dimension: NodeDimensions) => {
  const isValid = ({ width, height }: NodeCardDimension) =>
    Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  if (!isValid(dimension.card) || !isValid(dimension.occupied)) {
    return;
  }
  return {
    card: { ...dimension.card },
    occupied: { ...dimension.occupied }
  };
};

/**
 * 合并节点卡片测量结果：同一帧内每个节点只提交最后一次结果，删除或替换节点可移除待提交项。
 */
export const createDimensionBatcher = ({
  onFlush,
  scheduler = defaultScheduler
}: {
  onFlush: (updates: DimensionMeasurement[]) => void;
  scheduler?: DimensionFrameScheduler;
}): DimensionBatcher => {
  const pending = new Map<string, DimensionMeasurement>();
  let frameHandle: number | undefined;

  const flush = () => {
    frameHandle = undefined;
    if (pending.size === 0) return;

    const updates = [...pending.values()];
    pending.clear();
    onFlush(updates);
  };

  const enqueue = (measurement: DimensionMeasurement) => {
    const dimension = normalizeDimension(measurement.dimension);
    if (!dimension) return;

    pending.set(measurement.nodeId, { ...measurement, dimension });
    if (frameHandle === undefined) {
      frameHandle = scheduler.schedule(flush);
    }
  };

  const remove = (nodeId: string) => {
    pending.delete(nodeId);
  };

  const dispose = () => {
    if (frameHandle !== undefined) scheduler.cancel(frameHandle);
    frameHandle = undefined;
    pending.clear();
  };

  return { enqueue, remove, dispose };
};
