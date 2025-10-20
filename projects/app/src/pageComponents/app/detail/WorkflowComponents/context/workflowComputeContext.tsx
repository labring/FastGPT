// 复杂计算上下文

import React, { useCallback, useMemo } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext, WorkflowInitContext } from './workflowInitContext';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  Input_Template_Node_Height,
  Input_Template_Node_Width
} from '@fastgpt/global/core/workflow/template/input';
import type { Node } from 'reactflow';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { WorkflowActionsContext } from './workflowActionsContext';
import { useMemoizedFn } from 'ahooks';

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

export const WorkflowComputeProvider = ({ children }: { children: React.ReactNode }) => {
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const { setNodes } = useContextSelector(WorkflowBufferDataContext, (v) => v);

  /**
   * 获取父节点(Loop节点)的大小和位置
   * 基于子节点的位置计算父节点应该的位置和大小
   */
  const getParentNodeSizeAndPosition = useCallback(
    ({
      nodes,
      parentId
    }: Parameters<WorkflowComputeContextValue['getParentNodeSizeAndPosition']>[0]) => {
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
        { childNodes: [] as Node[], loopNode: undefined as Node<FlowNodeItemType> | undefined }
      );

      if (!loopNode) return;
      const loopChilWidth =
        loopNode.data.inputs.find((node) => node.key === NodeInputKeyEnum.nodeWidth)?.value ?? 0;
      const loopChilHeight =
        loopNode.data.inputs.find((node) => node.key === NodeInputKeyEnum.nodeHeight)?.value ?? 0;

      // 初始化为第一个节点的边界
      let minX = childNodes[0].position.x;
      let minY = childNodes[0].position.y;
      let maxX = childNodes[0].position.x + (childNodes[0].width || 0);
      let maxY = childNodes[0].position.y + (childNodes[0].height || 0);

      // 遍历所有节点找出最小/最大边界
      childNodes.forEach((node) => {
        const nodeWidth = node.width || 0;
        const nodeHeight = node.height || 0;

        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + nodeWidth);
        maxY = Math.max(maxY, node.position.y + nodeHeight);
      });

      const childWidth = Math.max(maxX - minX + 80, 840);
      const childHeight = Math.max(maxY - minY + 80, 600);

      const diffWidth = childWidth - loopChilWidth;
      const diffHeight = childHeight - loopChilHeight;
      const targetNodeWidth = (loopNode.width ?? 0) + diffWidth;
      const targetNodeHeight = (loopNode.height ?? 0) + diffHeight;

      const offsetHeight =
        loopNode.data.inputs.find((input) => input.key === NodeInputKeyEnum.loopNodeInputHeight)
          ?.value ?? 83;

      return {
        parentX: Math.round(minX - 70),
        parentY: Math.round(minY - offsetHeight - 240),
        childWidth,
        childHeight,
        nodeWidth: targetNodeWidth,
        nodeHeight: targetNodeHeight
      };
    },
    []
  );

  /**
   * 重置父节点的大小和位置
   * 调用 getParentNodeSizeAndPosition 计算新的大小和位置并更新
   */
  const resetParentNodeSizeAndPosition = useMemoizedFn((parentId: string) => {
    const res = getParentNodeSizeAndPosition({ nodes, parentId });
    if (!res) return;

    const { parentX, parentY, childWidth, childHeight } = res;

    // 一次性更新 inputs + position
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== parentId) return node;

        // 更新 inputs 中的 width 和 height
        const updatedInputs = node.data.inputs.map((input) => {
          if (input.key === NodeInputKeyEnum.nodeWidth) {
            return { ...Input_Template_Node_Width, value: childWidth };
          }
          if (input.key === NodeInputKeyEnum.nodeHeight) {
            return { ...Input_Template_Node_Height, value: childHeight };
          }
          return input;
        });

        // 同时更新 position 和 data
        return {
          ...node,
          position: { x: parentX, y: parentY },
          data: { ...node.data, inputs: updatedInputs }
        };
      })
    );
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
