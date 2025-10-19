// 工作流 UI 交互层
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useLocalStorageState } from 'ahooks';
import React, { type PropsWithChildren, useEffect, useMemo, useRef, useState } from 'react';
import { createContext } from 'use-context-selector';

// 创建 Context
type WorkflowUIContextValue = {
  /** 悬停的节点 ID */
  hoverNodeId?: string;

  /** 设置悬停的节点 ID */
  setHoverNodeId: React.Dispatch<React.SetStateAction<string | undefined>>;

  /** 悬停的边 ID */
  hoverEdgeId?: string;

  /** 设置悬停的边 ID */
  setHoverEdgeId: React.Dispatch<React.SetStateAction<string | undefined>>;

  /** 鼠标是否在 Canvas 中 */
  mouseInCanvas: boolean;

  /** ReactFlow 包装器 ref */
  reactFlowWrapper: React.RefObject<HTMLDivElement>;

  /** 工作流控制模式 */
  workflowControlMode: 'drag' | 'select';

  /** 设置工作流控制模式 */
  setWorkflowControlMode: (value: 'drag' | 'select') => void;

  /** 右键菜单 */
  menu: { top: number; left: number } | null;

  /** 设置右键菜单 */
  setMenu: React.Dispatch<React.SetStateAction<{ top: number; left: number } | null>>;
};
export const WorkflowUIContext = createContext<WorkflowUIContextValue>({
  setHoverNodeId: function (value: React.SetStateAction<string | undefined>): void {
    throw new Error('Function not implemented.');
  },
  setHoverEdgeId: function (value: React.SetStateAction<string | undefined>): void {
    throw new Error('Function not implemented.');
  },
  mouseInCanvas: false,
  reactFlowWrapper: { current: null },
  workflowControlMode: 'drag',
  setWorkflowControlMode: function (value: 'drag' | 'select'): void {
    throw new Error('Function not implemented.');
  },
  menu: null,
  setMenu: function (value: React.SetStateAction<{ top: number; left: number } | null>): void {
    throw new Error('Function not implemented.');
  }
});

export const WorkflowUIProvider: React.FC<PropsWithChildren> = ({ children }) => {
  // 悬停状态 (高频更新)
  const [hoverNodeId, setHoverNodeId] = useState<string>();
  const [hoverEdgeId, setHoverEdgeId] = useState<string>();

  // Canvas 交互
  const [mouseInCanvas, setMouseInCanvas] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleMouseInCanvas = (e: MouseEvent) => {
      setMouseInCanvas(true);
    };
    const handleMouseOutCanvas = (e: MouseEvent) => {
      setMouseInCanvas(false);
    };
    reactFlowWrapper?.current?.addEventListener('mouseenter', handleMouseInCanvas);
    reactFlowWrapper?.current?.addEventListener('mouseleave', handleMouseOutCanvas);
    return () => {
      reactFlowWrapper?.current?.removeEventListener('mouseenter', handleMouseInCanvas);
      reactFlowWrapper?.current?.removeEventListener('mouseleave', handleMouseOutCanvas);
    };
  }, [setMouseInCanvas]);

  // 控制模式
  const [workflowControlMode, setWorkflowControlMode] = useLocalStorageState<'drag' | 'select'>(
    'workflow-control-mode',
    {
      defaultValue: 'drag',
      listenStorageChange: true
    }
  );
  // 右键菜单
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);

  const contextValue = useMemoEnhance(() => {
    console.log('WorkflowUIContextValue 更新了');
    return {
      hoverNodeId,
      setHoverNodeId,
      hoverEdgeId,
      setHoverEdgeId,
      mouseInCanvas,
      reactFlowWrapper,
      workflowControlMode,
      setWorkflowControlMode,
      menu,
      setMenu
    };
  }, [hoverNodeId, hoverEdgeId, mouseInCanvas, workflowControlMode, setWorkflowControlMode, menu]);

  return <WorkflowUIContext.Provider value={contextValue}>{children}</WorkflowUIContext.Provider>;
};
