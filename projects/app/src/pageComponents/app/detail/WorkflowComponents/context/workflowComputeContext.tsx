// 复杂计算上下文

import React, { useCallback, useMemo } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext, WorkflowInitContext } from './workflowInitContext';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  Input_Template_Node_Height,
  Input_Template_Node_Width
} from '@fastgpt/global/core/workflow/template/input';
import type { Node } from '@xyflow/react';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useMemoizedFn } from 'ahooks';
import { useWorkflowStore } from '../store/useWorkflowStore';

// 创建 Context
type WorkflowComputeContextValue = {
  /** 重置父节点大小和位置 */
  resetParentNodeSizeAndPosition: (parentId: string) => void;

  /** 获取父节点大小和位置 */
  getParentNodeSizeAndPosition: (params: { nodes: Node<FlowNodeItemType>[]; parentId: string }) =>
    | {
        parentX: number;
        parentY: number;
        childWidth: number;
        childHeight: number;
        nodeWidth: number;
        nodeHeight: number;
      }
    | undefined;
};

export const WorkflowLayoutContext = createContext<WorkflowComputeContextValue>({
  resetParentNodeSizeAndPosition: function (parentId: string): void {
    throw new Error('Function not implemented.');
  },
  getParentNodeSizeAndPosition: function (params: {
    nodes: Node<FlowNodeItemType>[];
    parentId: string;
  }):
    | {
        parentX: number;
        parentY: number;
        childWidth: number;
        childHeight: number;
        nodeWidth: number;
        nodeHeight: number;
      }
    | undefined {
    throw new Error('Function not implemented.');
  }
});

/**
 * 基于子节点的位置和尺寸计算父容器节点 (Loop / LoopRun / ParallelRun) 的包围盒大小和位置。
 * 支持未经过 DOM 测量的节点，自动 fallback 到 initialWidth / initialHeight。
 */
export const calculateParentNodeSizeAndPosition = ({
  nodes,
  parentId
}: {
  nodes: Node<FlowNodeItemType>[];
  parentId: string;
}):
  | {
      parentX: number;
      parentY: number;
      childWidth: number;
      childHeight: number;
      nodeWidth: number;
      nodeHeight: number;
    }
  | undefined => {
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

  const loopChilWidth =
    loopNode.data.inputs.find((node) => node.key === NodeInputKeyEnum.nodeWidth)?.value ?? 0;
  const loopChilHeight =
    loopNode.data.inputs.find((node) => node.key === NodeInputKeyEnum.nodeHeight)?.value ?? 0;

  const firstNode = childNodes[0];
  const firstWidth = firstNode.measured?.width ?? firstNode.width ?? firstNode.initialWidth ?? 350;
  const firstHeight =
    firstNode.measured?.height ?? firstNode.height ?? firstNode.initialHeight ?? 150;

  // 初始化为第一个节点的边界
  let minX = firstNode.position.x;
  let minY = firstNode.position.y;
  let maxX = firstNode.position.x + firstWidth;
  let maxY = firstNode.position.y + firstHeight;

  // 遍历所有节点找出最小/最大边界
  childNodes.forEach((node) => {
    const width = node.measured?.width ?? node.width ?? node.initialWidth ?? 350;
    const height = node.measured?.height ?? node.height ?? node.initialHeight ?? 150;

    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + width);
    maxY = Math.max(maxY, node.position.y + height);
  });

  const childWidth = Math.max(maxX - minX + 80, 0);
  const childHeight = Math.max(maxY - minY + 80, 0);

  const diffWidth = childWidth - loopChilWidth;
  const diffHeight = childHeight - loopChilHeight;
  const targetNodeWidth = (loopNode.measured?.width ?? 0) + diffWidth;
  const targetNodeHeight = (loopNode.measured?.height ?? 0) + diffHeight;

  const offsetHeight =
    loopNode.data.inputs.find((input) => input.key === NodeInputKeyEnum.nestedNodeInputHeight)
      ?.value ?? 83;

  return {
    parentX: Math.round(minX - 70),
    parentY: Math.round(minY - offsetHeight - 240),
    childWidth: Math.round(childWidth),
    childHeight: Math.round(childHeight),
    nodeWidth: targetNodeWidth,
    nodeHeight: targetNodeHeight
  };
};

export const WorkflowComputeProvider = ({ children }: { children: React.ReactNode }) => {
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const { setNodes } = useContextSelector(WorkflowBufferDataContext, (v) => v);

  /**
   * 获取父节点(Loop节点)的大小和位置
   * 基于子节点的位置计算父节点应该的位置和大小
   */
  const getParentNodeSizeAndPosition = useCallback(
    (params: Parameters<WorkflowComputeContextValue['getParentNodeSizeAndPosition']>[0]) => {
      return calculateParentNodeSizeAndPosition(params);
    },
    []
  );

  /**
   * 重置父节点的大小和位置
   * 调用 getParentNodeSizeAndPosition 计算新的大小和位置并更新
   */
  const resetParentNodeSizeAndPosition = useMemoizedFn((parentId: string) => {
    const latestNodes = useWorkflowStore.getState().nodes;
    const res = getParentNodeSizeAndPosition({ nodes: latestNodes, parentId });
    if (!res) return;

    const { parentX, parentY, childWidth, childHeight } = res;

    // 一次性更新 inputs + position
    setNodes((currentNodes) => {
      const currentParent = currentNodes.find((n) => n.id === parentId);
      if (!currentParent) return currentNodes;

      const deltaX = parentX - currentParent.position.x;
      const deltaY = parentY - currentParent.position.y;

      const currentWidth = currentParent.data.inputs.find(
        (input) => input.key === NodeInputKeyEnum.nodeWidth
      )?.value;
      const currentHeight = currentParent.data.inputs.find(
        (input) => input.key === NodeInputKeyEnum.nodeHeight
      )?.value;

      // 尺寸与位置均未发生变化时直接短路返回，避免产生无意义的 nodes 新引用触发死循环
      if (
        deltaX === 0 &&
        deltaY === 0 &&
        currentWidth === childWidth &&
        currentHeight === childHeight
      ) {
        return currentNodes;
      }

      return currentNodes.map((node) => {
        if (node.id === parentId) {
          const hasWidth = node.data.inputs.some((i) => i.key === NodeInputKeyEnum.nodeWidth);
          const hasHeight = node.data.inputs.some((i) => i.key === NodeInputKeyEnum.nodeHeight);

          let updatedInputs = node.data.inputs.map((input) => {
            if (input.key === NodeInputKeyEnum.nodeWidth) {
              return { ...Input_Template_Node_Width, value: childWidth };
            }
            if (input.key === NodeInputKeyEnum.nodeHeight) {
              return { ...Input_Template_Node_Height, value: childHeight };
            }
            return input;
          });

          if (!hasWidth) {
            updatedInputs = [...updatedInputs, { ...Input_Template_Node_Width, value: childWidth }];
          }
          if (!hasHeight) {
            updatedInputs = [
              ...updatedInputs,
              { ...Input_Template_Node_Height, value: childHeight }
            ];
          }

          // 同时更新 position 和 data
          return {
            ...node,
            position: { x: parentX, y: parentY },
            data: { ...node.data, inputs: updatedInputs }
          };
        }

        return node;
      });
    });
  });

  const contextValue = useMemo(() => {
    return {
      resetParentNodeSizeAndPosition,
      getParentNodeSizeAndPosition
    };
  }, [resetParentNodeSizeAndPosition, getParentNodeSizeAndPosition]);

  return (
    <WorkflowLayoutContext.Provider value={contextValue}>{children}</WorkflowLayoutContext.Provider>
  );
};
