import type { Node } from '@xyflow/react';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getNodeRect, type DimensionReader } from '../canvas/nodeDimensions';

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
 * 纯函数：只读传入的画布节点数组，不写文档、不依赖 Context，调用方自行决定如何使用结果。
 * 子节点未完成测量时返回 undefined；展开容器可先由子节点尺寸启动布局。
 * childWidth/childHeight 是带四边 32px padding 的内容区；nodeWidth/nodeHeight 还包含卡片标题、表单和外层留白。
 */
export const getParentNodeSizeAndPosition = ({
  nodes,
  parentId,
  getNodeDimension,
  previousChildBounds,
  containerContentOffset,
  containerContentSize,
  initialChildBounds,
  previousParentPosition
}: {
  nodes: Node<FlowNodeItemType>[];
  parentId: string;
  getNodeDimension: DimensionReader;
  previousChildBounds?: ContainerBounds;
  containerContentOffset?: { x: number; y: number };
  containerContentSize?: { width: number; height: number };
  initialChildBounds?: Pick<ContainerBounds, 'left' | 'top'>;
  previousParentPosition?: { x: number; y: number };
}): ParentNodeLayout | undefined => {
  const { childNodes, loopNode } = nodes.reduce(
    (acc, node) => {
      if (node.data.parentNodeId === parentId) {
        acc.childNodes.push(node);
      }
      if (node.id === parentId) {
        acc.loopNode = node;
      }
      return acc;
    },
    {
      childNodes: [] as Node<FlowNodeItemType>[],
      loopNode: undefined as Node<FlowNodeItemType> | undefined
    }
  );

  if (!loopNode) return;
  const loopNodeRect = getNodeRect(loopNode, getNodeDimension(loopNode.id));
  const folded = loopNode.data.isFolded === true;
  if (folded || childNodes.length === 0) {
    if (!loopNodeRect) return;
    return {
      parentX: loopNode.position.x,
      parentY: loopNode.position.y,
      childWidth: 0,
      childHeight: 0,
      nodeWidth: loopNodeRect.width,
      nodeHeight: loopNodeRect.height,
      positionDelta: { x: 0, y: 0 },
      folded
    };
  }

  const childRects = childNodes.map((node) => getNodeRect(node, getNodeDimension(node.id)));
  if (childRects.some((rect) => !rect)) return;

  const left = Math.min(...childRects.map((rect) => rect!.left));
  const top = Math.min(...childRects.map((rect) => rect!.top));
  const right = Math.max(...childRects.map((rect) => rect!.right));
  const bottom = Math.max(...childRects.map((rect) => rect!.bottom));
  const childBounds: ContainerBounds = {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
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
              (loopNode.position.x - (previousParentPosition?.x ?? loopNode.position.x)),
            y:
              childBounds.top -
              previousChildBounds.top -
              (loopNode.position.y - (previousParentPosition?.y ?? loopNode.position.y))
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
            loopNode.position.x,
          y:
            childBounds.top -
            containerContentOffset.y -
            CONTAINER_CHILD_PADDING -
            loopNode.position.y
        };

  return {
    parentX: loopNode.position.x + positionDelta.x,
    parentY: loopNode.position.y + positionDelta.y,
    childWidth,
    childHeight,
    nodeWidth: childWidth + cardExtraWidth,
    nodeHeight: childHeight + cardExtraHeight,
    childBounds,
    positionDelta,
    folded
  };
};

/** 新建多子节点容器只调整 renderer 位置，让直接子节点从 padding 原点开始。 */
export const normalizeContainerChildPositions = ({
  nodes,
  parentId,
  bounds,
  targetOrigin
}: {
  nodes: Node<FlowNodeItemType>[];
  parentId: string;
  bounds: ContainerBounds;
  targetOrigin: Pick<ContainerBounds, 'left' | 'top'>;
}) => {
  const offsetX = targetOrigin.left - bounds.left;
  const offsetY = targetOrigin.top - bounds.top;

  nodes.forEach((node) => {
    if (node.data.parentNodeId !== parentId) return;
    node.position = {
      x: node.position.x + offsetX,
      y: node.position.y + offsetY
    };
  });
};
