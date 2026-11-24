import {
  getNodeRect,
  getRectBounds,
  WORKFLOW_NODE_MIN_WIDTH,
  type DimensionReader,
  type NodeRect
} from '../canvas/nodeDimensions';

type LayoutNode = Parameters<typeof getNodeRect>[0];
type LayoutParent = LayoutNode & { data: { isFolded?: boolean } };

export type ContainerBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type ParentNodeLayout = {
  parentX: number;
  parentY: number;
  childWidth: number;
  childHeight: number;
  nodeWidth: number;
  nodeHeight: number;
  childBounds?: ContainerBounds;
  contentOffset?: { x: number; y: number };
  positionDelta: { x: number; y: number };
  folded: boolean;
};

export const CONTAINER_CHILD_PADDING = 32;

/**
 * 按子节点包围盒计算容器（Loop 系列）节点应有的位置与尺寸。
 *
 * 只读取已按父子关系分组的直接子节点，避免每个容器各自扫描画布。
 * 子节点未完成测量时返回 undefined；展开容器可先由子节点尺寸启动布局。
 * childWidth/childHeight 是内容区的最小尺寸，包含四边 32px padding；卡片宽度还受节点最小宽度约束。
 */
export const getParentNodeSizeAndPosition = ({
  parent,
  childNodes,
  getNodeDimension,
  previousChildBounds,
  containerContentOffset,
  containerContentSize,
  initialChildBounds,
  previousParentPosition
}: {
  parent: LayoutParent;
  childNodes: readonly LayoutNode[];
  getNodeDimension: DimensionReader;
  previousChildBounds?: ContainerBounds;
  containerContentOffset?: { x: number; y: number };
  containerContentSize?: { width: number; height: number };
  initialChildBounds?: Pick<ContainerBounds, 'left' | 'top'>;
  previousParentPosition?: { x: number; y: number };
}): ParentNodeLayout | undefined => {
  const loopNodeRect = getNodeRect(parent, getNodeDimension(parent.id));
  const folded = parent.data.isFolded === true;
  if (folded || childNodes.length === 0) {
    if (!loopNodeRect) return;
    return {
      parentX: parent.position.x,
      parentY: parent.position.y,
      childWidth: 0,
      childHeight: 0,
      nodeWidth: loopNodeRect.width,
      nodeHeight: loopNodeRect.height,
      positionDelta: { x: 0, y: 0 },
      folded
    };
  }

  const childRects: NodeRect[] = [];
  for (const node of childNodes) {
    const rect = getNodeRect(node, getNodeDimension(node.id));
    if (!rect) return;
    childRects.push(rect);
  }
  const childBounds = getRectBounds(childRects);
  if (!childBounds) return;
  const childWidth = childBounds.width + CONTAINER_CHILD_PADDING * 2;
  const childHeight = childBounds.height + CONTAINER_CHILD_PADDING * 2;
  // 从同一帧的卡片与内容区测量中扣除旧内容尺寸，避免旧包围盒阻止容器收缩。
  const cardExtraWidth =
    loopNodeRect && containerContentSize
      ? Math.max(0, loopNodeRect.width - containerContentSize.width)
      : 0;
  const cardExtraHeight =
    loopNodeRect && containerContentSize
      ? Math.max(0, loopNodeRect.height - containerContentSize.height)
      : 0;
  const positionDelta =
    containerContentOffset === undefined
      ? previousChildBounds
        ? {
            x:
              childBounds.left -
              previousChildBounds.left -
              (parent.position.x - (previousParentPosition?.x ?? parent.position.x)),
            y:
              childBounds.top -
              previousChildBounds.top -
              (parent.position.y - (previousParentPosition?.y ?? parent.position.y))
          }
        : initialChildBounds
          ? {
              x: childBounds.left - initialChildBounds.left,
              y: childBounds.top - initialChildBounds.top
            }
          : { x: 0, y: 0 }
      : {
          x:
            childBounds.left -
            containerContentOffset.x -
            CONTAINER_CHILD_PADDING -
            parent.position.x,
          y:
            childBounds.top - containerContentOffset.y - CONTAINER_CHILD_PADDING - parent.position.y
        };

  return {
    parentX: parent.position.x + positionDelta.x,
    parentY: parent.position.y + positionDelta.y,
    childWidth,
    childHeight,
    nodeWidth: Math.max(childWidth + cardExtraWidth, WORKFLOW_NODE_MIN_WIDTH),
    nodeHeight: childHeight + cardExtraHeight,
    childBounds,
    positionDelta,
    folded
  };
};
