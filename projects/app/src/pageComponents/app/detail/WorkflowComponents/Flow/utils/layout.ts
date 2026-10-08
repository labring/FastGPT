import type { Node } from 'reactflow';
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
 * 任一节点还没进入 Dimension Index 时返回 undefined，由调用方在尺寸到齐后重试。
 * 容器自身尺寸来自已测量卡片，子节点区域只取直接子节点包围盒并补 32px padding。
 */
export const getParentNodeSizeAndPosition = ({
  nodes,
  parentId,
  getNodeDimension,
  previousChildBounds,
  initialChildBounds,
  previousParentPosition
}: {
  nodes: Node<FlowNodeItemType>[];
  parentId: string;
  getNodeDimension: DimensionReader;
  previousChildBounds?: ContainerBounds;
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
  if (!loopNodeRect) return;

  const folded = loopNode.data.isFolded === true;
  if (folded || childNodes.length === 0) {
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
  const positionDelta = previousChildBounds
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
      : { x: 0, y: 0 };

  return {
    parentX: loopNode.position.x + positionDelta.x,
    parentY: loopNode.position.y + positionDelta.y,
    childWidth,
    childHeight,
    nodeWidth: Math.max(loopNodeRect.width, childWidth),
    nodeHeight: Math.max(loopNodeRect.height, childHeight),
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
