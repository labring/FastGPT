// renderer 层：画布选中态。选中只存在于 ReactFlow 本地节点数组，不属于工作流文档数据。
import React, { useMemo, type PropsWithChildren } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useWorkflowCanvasValue } from '../canvas/workflowCanvasContext';

type WorkflowSelectionContextValue = {
  /** 按节点 id 标记选中；只有选中的节点在 map 内。 */
  selectedNodesMap: Record<string, boolean>;
};

const WorkflowSelectionContext = createContext<WorkflowSelectionContextValue>({
  selectedNodesMap: {}
});

export const useWorkflowSelectionValue = <T,>(
  selector: (value: WorkflowSelectionContextValue) => T
): T => useContextSelector(WorkflowSelectionContext, selector);

/**
 * 选中态 Provider：从画布本地数组收集选中节点。
 * 拖拽帧与测量会频繁更换数组身份，因此用 useMemoEnhance 稳定 map 身份，
 * 选中集合没变时消费者（边、Handle）不会重渲染。
 */
export const WorkflowSelectionProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const nodes = useWorkflowCanvasValue((v) => v.nodes);

  const collected = useMemo(() => {
    const map: Record<string, boolean> = {};
    nodes.forEach((node) => {
      if (node.selected) map[node.data.nodeId] = true;
    });
    return map;
  }, [nodes]);
  const selectedNodesMap = useMemoEnhance(() => collected, [collected]);

  const contextValue = useMemoEnhance(() => ({ selectedNodesMap }), [selectedNodesMap]);

  return (
    <WorkflowSelectionContext.Provider value={contextValue}>
      {children}
    </WorkflowSelectionContext.Provider>
  );
};
