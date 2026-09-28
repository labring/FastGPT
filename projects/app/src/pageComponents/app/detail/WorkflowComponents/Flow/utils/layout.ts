import type { Node } from 'reactflow';
import {
  Input_Template_NESTED_NODE_OFFSET,
  Input_Template_Node_Height,
  Input_Template_Node_Width
} from '@fastgpt/global/core/workflow/template/input';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getNodeRect, type DimensionReader } from '../context/dimensionIndex';

export type ParentNodeLayout = {
  parentX: number;
  parentY: number;
  childWidth: number;
  childHeight: number;
  nodeWidth: number;
  nodeHeight: number;
};

// ponytail: 三个常量取自模板默认尺寸，与容器尺寸字段被剥离前的画布行为一致；测量重做后按真实尺寸计算。
const CONTAINER_WIDTH = Number(Input_Template_Node_Width.value ?? 0);
const CONTAINER_HEIGHT = Number(Input_Template_Node_Height.value ?? 0);
const CONTAINER_INPUT_HEIGHT = Number(Input_Template_NESTED_NODE_OFFSET.value ?? 83);

/**
 * 按子节点包围盒计算容器（Loop 系列）节点应有的位置与尺寸。
 *
 * 纯函数：只读传入的画布节点数组，不写文档、不依赖 Context，调用方自行决定如何使用结果。
 * 任一节点还没进入 Dimension Index 时返回 undefined，由调用方在尺寸到齐后重试。
 *
 * 注意：容器尺寸字段（nodeWidth/nodeHeight/nestedNodeInputHeight）目前不在 Runtime 文档里，
 * 渲染副作用也不回写（已接受的过渡回归），容器外框按兜底尺寸渲染；
 * 修复属于容器尺寸测量重做，见延后项文档。
 */
export const getParentNodeSizeAndPosition = ({
  nodes,
  parentId,
  getNodeDimension
}: {
  nodes: Node<FlowNodeItemType>[];
  parentId: string;
  getNodeDimension: DimensionReader;
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
  if (childNodes.length === 0) return;
  const loopNodeRect = getNodeRect(loopNode, getNodeDimension(loopNode.id));
  const childRects = childNodes.map((node) => getNodeRect(node, getNodeDimension(node.id)));
  if (!loopNodeRect || childRects.some((rect) => !rect)) return;

  const loopChilWidth = CONTAINER_WIDTH;
  const loopChilHeight = CONTAINER_HEIGHT;

  // 初始化为第一个节点的边界
  const firstChildRect = childRects[0]!;
  let minX = firstChildRect.left;
  let minY = firstChildRect.top;
  let maxX = firstChildRect.right;
  let maxY = firstChildRect.bottom;

  // 遍历所有子节点找出最小/最大边界
  childRects.forEach((rect) => {
    if (!rect) return;
    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.right);
    maxY = Math.max(maxY, rect.bottom);
  });

  const childWidth = Math.max(maxX - minX + 80, 0);
  const childHeight = Math.max(maxY - minY + 80, 0);

  const diffWidth = childWidth - loopChilWidth;
  const diffHeight = childHeight - loopChilHeight;
  const targetNodeWidth = loopNodeRect.width + diffWidth;
  const targetNodeHeight = loopNodeRect.height + diffHeight;

  const offsetHeight = CONTAINER_INPUT_HEIGHT;

  return {
    parentX: Math.round(minX - 70),
    parentY: Math.round(minY - offsetHeight - 240),
    childWidth,
    childHeight,
    nodeWidth: targetNodeWidth,
    nodeHeight: targetNodeHeight
  };
};
