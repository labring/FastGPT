export type NodeCardDimension = {
  width: number;
  height: number;
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

type PositionedNode = {
  id: string;
  position: { x: number; y: number };
};

export type DimensionMeasurement = {
  nodeId: string;
  generation: number;
  dimension: NodeCardDimension;
};

export type DimensionFrameScheduler = {
  schedule: (callback: () => void) => number;
  cancel: (handle: number) => void;
};

export type DimensionRegistration = {
  report: (dimension: NodeCardDimension) => void;
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

const normalizeDimension = (dimension: NodeCardDimension) => {
  const { width, height } = dimension;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return;
  }
  return { width, height };
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
