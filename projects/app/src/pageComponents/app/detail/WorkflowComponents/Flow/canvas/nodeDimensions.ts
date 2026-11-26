// region dimensionContracts Canvas dimension and viewport contracts

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
  sourceHandleCenters?: ReadonlyMap<string, NodeSourceHandleCenter>;
  containerContentOffset?: {
    x: number;
    y: number;
  };
  containerContentSize?: NodeCardDimension;
};

type NodeSourceHandleCenter = {
  x: number;
  y: number;
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

export type ViewportFitOptions = {
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
  useEstimatedDimensions?: boolean;
};

type ViewportTransform = Pick<CanvasViewport, 'x' | 'y' | 'zoom'>;

export type ViewportNode = {
  id: string;
  position: { x: number; y: number };
  parentNodeId?: string;
  isFolded?: boolean;
  selected?: boolean;
  dragging?: boolean;
  focusPinned?: boolean;
};

type ViewportNodeClassification = {
  visibleNodeIds: ReadonlySet<string>;
  overscanNodeIds: ReadonlySet<string>;
  fullNodeIds: ReadonlySet<string>;
  hiddenNodeIds: ReadonlySet<string>;
  priorities: ReadonlyMap<string, 0 | 1 | 2>;
};

type ViewportEdge = {
  id: string;
  source: string;
  target: string;
};

type RenderableGraphClassification = ViewportNodeClassification & {
  renderedNodeIds: ReadonlySet<string>;
  renderedEdgeIds: ReadonlySet<string>;
};

// endregion

// region dimensionProjection Canvas viewport classification and fit calculation

const WORKFLOW_VIEWPORT_OVERSCAN = 240;
export const WORKFLOW_FULL_RENDER_NODE_LIMIT = 50;
export const WORKFLOW_NODE_MIN_WIDTH = 300;
export const WORKFLOW_NODE_MEASUREMENT_ESTIMATE: NodeDimensions = {
  card: { width: WORKFLOW_NODE_MIN_WIDTH, height: 120 },
  occupied: { width: WORKFLOW_NODE_MIN_WIDTH, height: 120 }
};

export const shouldRenderWorkflowNodesFully = (nodeCount: number) =>
  nodeCount <= WORKFLOW_FULL_RENDER_NODE_LIMIT;

/**
 * 把屏幕像素 overscan 转成画布坐标范围；尺寸估算只服务裁剪，不写入 Dimension Index。
 */
const getViewportRange = ({
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

/** 画布节点的位置已经是绝对坐标；parentNodeId 只表示业务归属，不参与坐标叠加。 */
export const getAbsoluteNodePositions = (nodes: readonly ViewportNode[]) => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const positionById = new Map(nodes.map((node) => [node.id, node.position]));
  return { nodeById, positionById };
};

const getFoldedAncestorId = ({
  node,
  nodeById,
  outermost = false
}: {
  node: ViewportNode;
  nodeById: ReadonlyMap<string, ViewportNode>;
  outermost?: boolean;
}) => {
  const visited = new Set<string>();
  let foldedAncestorId: string | undefined;
  let parentId = node.parentNodeId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodeById.get(parentId);
    if (!parent) break;
    if (parent.isFolded) {
      if (!outermost) return parentId;
      foldedAncestorId = parentId;
    }
    parentId = parent.parentNodeId;
  }
  return foldedAncestorId;
};

/** 判断节点是否被任一折叠祖先隐藏。 */
export const isHiddenByFold = (node: ViewportNode, nodeById: ReadonlyMap<string, ViewportNode>) =>
  getFoldedAncestorId({ node, nodeById }) !== undefined;

/** 返回 fit 目标节点；折叠祖先下的后代不参与 viewport 计算。 */
export const getViewportFitNodeIds = ({
  nodes,
  nodeIds
}: {
  nodes: readonly ViewportNode[];
  nodeIds?: readonly string[];
}) => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const targetIds = nodeIds ? new Set(nodeIds) : undefined;

  return nodes
    .filter((node) => (!targetIds || targetIds.has(node.id)) && !isHiddenByFold(node, nodeById))
    .map((node) => node.id);
};

/** 显式定位隐藏节点时使用画布上可见的最外层折叠祖先。 */
export const getViewportFocusNodeIds = (
  nodes: readonly ViewportNode[],
  nodeIds: readonly string[]
) => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const targets = new Set<string>();
  for (const nodeId of nodeIds) {
    const node = nodeById.get(nodeId);
    if (node) targets.add(getFoldedAncestorId({ node, nodeById, outermost: true }) ?? nodeId);
  }
  return [...targets];
};

/** 返回 fit 目标中尚未进入 Dimension Index 的节点，供延后 fit 与强制测量使用。 */
export const getUnmeasuredViewportFitNodeIds = ({
  nodes,
  nodeIds,
  dimensions
}: {
  nodes: readonly ViewportNode[];
  nodeIds?: readonly string[];
  dimensions: ReadonlyMap<string, NodeDimensions>;
}) => getViewportFitNodeIds({ nodes, nodeIds }).filter((nodeId) => !dimensions.has(nodeId));

/** 计算画布矩形的共同包围盒。 */
export const getRectBounds = (rects: readonly NodeRect[]): NodeRect | undefined => {
  if (rects.length === 0) return;

  let { left, right, top, bottom } = rects[0];
  for (const rect of rects) {
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
  }
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

/**
 * 基于完整节点图与 Dimension Index 计算 viewport，不依赖 React Flow 当前挂载的节点集合。
 * nodeIds 未提供时适配整张可见画布；提供时只定位指定节点，父节点链仍用于还原绝对坐标。
 */
export const getViewportForNodeIds = ({
  nodes,
  nodeIds,
  dimensions,
  width,
  height,
  padding = 0.3,
  minZoom = 0.1,
  maxZoom = 3,
  useEstimatedDimensions = false
}: {
  nodes: readonly ViewportNode[];
  nodeIds?: readonly string[];
  dimensions: ReadonlyMap<string, NodeDimensions>;
  width: number;
  height: number;
} & ViewportFitOptions): ViewportTransform | undefined => {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return;

  const { positionById } = getAbsoluteNodePositions(nodes);
  const fitNodeIds = new Set(getViewportFitNodeIds({ nodes, nodeIds }));
  const rects = nodes.flatMap((node) => {
    if (!fitNodeIds.has(node.id)) return [];

    const dimension =
      dimensions.get(node.id)?.card ??
      (useEstimatedDimensions ? WORKFLOW_NODE_MEASUREMENT_ESTIMATE.card : undefined);
    const position = positionById.get(node.id) ?? node.position;
    const rect = getNodeRect({ id: node.id, position }, dimension);
    return rect ? [rect] : [];
  });
  const bounds = getRectBounds(rects);
  if (!bounds) return;

  const safePadding = Math.max(padding, 0);
  const zoom = Math.min(
    width / (Math.max(bounds.width, 1) * (1 + safePadding)),
    height / (Math.max(bounds.height, 1) * (1 + safePadding))
  );
  const clampedZoom = Math.min(Math.max(zoom, minZoom), maxZoom);
  return {
    x: width / 2 - bounds.centerX * clampedZoom,
    y: height / 2 - bounds.centerY * clampedZoom,
    zoom: clampedZoom
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
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const viewportRange = getViewportRange({ viewport, overscan: 0 });
  const safeRange = getViewportRange({ viewport, overscan });
  const visibleNodeIds = new Set<string>();
  const overscanNodeIds = new Set<string>();
  const hiddenNodeIds = new Set<string>();
  const fullNodeIds = new Set<string>();
  const renderedNodeIds = new Set<string>();
  const renderedEdgeIds = new Set<string>();
  const priorities = new Map<string, 0 | 1 | 2>();
  const rectById = new Map<string, NodeRect>();

  // 每个节点使用自己的绝对坐标；容器与兄弟节点的可见性独立。
  for (const node of nodes) {
    if (isHiddenByFold(node, nodeById)) {
      hiddenNodeIds.add(node.id);
      continue;
    }
    const rect = getNodeRect(node, (dimensions.get(node.id) ?? estimate).occupied);
    if (!rect) continue;
    rectById.set(node.id, rect);

    if (
      node.selected ||
      node.dragging ||
      node.focusPinned ||
      areNodeRectsIntersecting(rect, viewportRange)
    ) {
      visibleNodeIds.add(node.id);
      priorities.set(node.id, 0);
    } else if (areNodeRectsIntersecting(rect, safeRange)) {
      overscanNodeIds.add(node.id);
      priorities.set(node.id, 1);
    } else {
      priorities.set(node.id, 2);
      continue;
    }
    fullNodeIds.add(node.id);
    renderedNodeIds.add(node.id);
  }

  for (const edge of edges) {
    const sourceRect = rectById.get(edge.source);
    const targetRect = rectById.get(edge.target);
    if (!sourceRect || !targetRect) continue;

    const edgeBounds = getRectBounds([sourceRect, targetRect]);
    if (
      !visibleNodeIds.has(edge.source) &&
      !visibleNodeIds.has(edge.target) &&
      (!edgeBounds || !areNodeRectsIntersecting(edgeBounds, safeRange))
    ) {
      continue;
    }
    renderedEdgeIds.add(edge.id);
    renderedNodeIds.add(edge.source);
    renderedNodeIds.add(edge.target);
  }

  // 包含边端点后统一补齐可见祖先。重复或失效的父节点结束当前链。
  const visitedAncestors = new Set<string>();
  for (const nodeId of renderedNodeIds) {
    let parentId = nodeById.get(nodeId)?.parentNodeId;
    while (parentId && !visitedAncestors.has(parentId)) {
      const parent = nodeById.get(parentId);
      if (!parent || hiddenNodeIds.has(parentId)) break;
      visitedAncestors.add(parentId);
      renderedNodeIds.add(parentId);
      parentId = parent.parentNodeId;
    }
  }

  return {
    visibleNodeIds,
    overscanNodeIds,
    hiddenNodeIds,
    priorities,
    fullNodeIds,
    renderedNodeIds,
    renderedEdgeIds
  };
};

// endregion

// region dimensionMeasurement Canvas measurement queue and batching

type MeasurementQueueEntry = {
  nodeId: string;
  generation: number;
  priority: 0 | 1 | 2;
};

type MeasurementQueue = {
  upsert: (entry: MeasurementQueueEntry) => void;
  take: (
    limit: number,
    shouldTake?: (entry: MeasurementQueueEntry) => boolean
  ) => MeasurementQueueEntry[];
  remove: (nodeId: string) => void;
  clear: () => void;
  getSize: () => number;
};

/** 小型优先队列：同一节点只保留最新 generation，取出后由 Canvas Context 负责挂载生命周期。 */
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

type DimensionFrameScheduler = {
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
    occupied: { ...dimension.occupied },
    ...(dimension.sourceHandleCenters
      ? { sourceHandleCenters: new Map(dimension.sourceHandleCenters) }
      : {}),
    ...(dimension.containerContentOffset &&
    Number.isFinite(dimension.containerContentOffset.x) &&
    Number.isFinite(dimension.containerContentOffset.y)
      ? { containerContentOffset: { ...dimension.containerContentOffset } }
      : {}),
    ...(dimension.containerContentSize &&
    Number.isFinite(dimension.containerContentSize.width) &&
    Number.isFinite(dimension.containerContentSize.height) &&
    dimension.containerContentSize.width >= 0 &&
    dimension.containerContentSize.height >= 0
      ? { containerContentSize: { ...dimension.containerContentSize } }
      : {})
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

// endregion
