// 工作流 UI 交互层
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useLocalStorageState } from 'ahooks';
import React, { type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
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

  /** ReactFlow 包装器 callback ref */
  reactFlowWrapperCallback: (node: HTMLDivElement | null) => void;

  /** 工作流控制模式 */
  workflowControlMode: 'drag' | 'select';

  /** 设置工作流控制模式 */
  setWorkflowControlMode: (value: 'drag' | 'select') => void;

  /** 演示模式 */
  presentationMode: boolean;

  /** 设置演示模式 */
  setPresentationMode: React.Dispatch<React.SetStateAction<boolean>>;

  /** 右键菜单 */
  menu: { top: number; left: number } | null;

  /** 设置右键菜单 */
  setMenu: React.Dispatch<React.SetStateAction<{ top: number; left: number } | null>>;
};
export const WorkflowUIContext = createContext<WorkflowUIContextValue>({
  setHoverNodeId: function (_value: React.SetStateAction<string | undefined>): void {
    throw new Error('Function not implemented.');
  },
  setHoverEdgeId: function (_value: React.SetStateAction<string | undefined>): void {
    throw new Error('Function not implemented.');
  },
  mouseInCanvas: false,
  reactFlowWrapperCallback: function (_node: HTMLDivElement | null): void {
    throw new Error('Function not implemented.');
  },
  workflowControlMode: 'drag',
  setWorkflowControlMode: function (_value: 'drag' | 'select'): void {
    throw new Error('Function not implemented.');
  },
  presentationMode: false,
  setPresentationMode: function (_value: React.SetStateAction<boolean>): void {
    throw new Error('Function not implemented.');
  },
  menu: null,
  setMenu: function (_value: React.SetStateAction<{ top: number; left: number } | null>): void {
    throw new Error('Function not implemented.');
  }
});

export const WorkflowUIProvider: React.FC<PropsWithChildren> = ({ children }) => {
  // 悬停状态 (高频更新)
  const [hoverNodeId, setHoverNodeId] = useState<string>();
  const [hoverEdgeId, setHoverEdgeId] = useState<string>();

  // Canvas 交互
  const [mouseInCanvas, setMouseInCanvas] = useState(false);
  // 使用 ref 来存储 wrapper 引用和 cleanup 函数
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const reactFlowWrapperCallback = useCallback((node: HTMLDivElement | null) => {
    // 先清理旧的事件监听器
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (node) {
      (reactFlowWrapper as any).current = node;

      const handleMouseInCanvas = () => {
        setMouseInCanvas(true);
      };
      const handleMouseOutCanvas = () => {
        setMouseInCanvas(false);
      };

      node.addEventListener('mouseenter', handleMouseInCanvas);
      node.addEventListener('mouseleave', handleMouseOutCanvas);

      // 存储 cleanup 函数到 ref
      cleanupRef.current = () => {
        node.removeEventListener('mouseenter', handleMouseInCanvas);
        node.removeEventListener('mouseleave', handleMouseOutCanvas);
        setMouseInCanvas(false);
      };
    } else {
      (reactFlowWrapper as any).current = null;
    }
  }, []);

  // 组件 unmount 时清理
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  // 控制模式
  const [workflowControlMode, setWorkflowControlMode] = useLocalStorageState<'drag' | 'select'>(
    'workflow-control-mode',
    {
      defaultValue: 'drag',
      listenStorageChange: true
    }
  );
  // 演示模式
  const [presentationMode, setPresentationMode] = useState(false);
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
      reactFlowWrapperCallback,
      workflowControlMode,
      setWorkflowControlMode,
      presentationMode,
      setPresentationMode,
      menu,
      setMenu
    };
  }, [
    hoverNodeId,
    hoverEdgeId,
    mouseInCanvas,
    reactFlowWrapperCallback,
    workflowControlMode,
    setWorkflowControlMode,
    presentationMode,
    menu
  ]);

  return <WorkflowUIContext.Provider value={contextValue}>{children}</WorkflowUIContext.Provider>;
};
