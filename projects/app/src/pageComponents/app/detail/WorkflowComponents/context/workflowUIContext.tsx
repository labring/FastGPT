// 工作流 UI 交互层
import React, { type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';
import { WorkflowBufferDataContext } from './workflowInitContext';
import { useWorkflowDemoTrack } from '@/web/common/middle/tracks/workflowDemoTrack';
import { useWorkflowStore } from '../store/useWorkflowStore';

type MousePosition = { x: number; y: number };

type WorkflowUIContextValue = {
  /** 鼠标是否在 Canvas 中 */
  mouseInCanvas: boolean;

  /** 获取鼠标在 Canvas 中的最新屏幕位置 */
  getMousePosition: () => MousePosition | null;

  /** ReactFlow 包装器 callback ref */
  reactFlowWrapperCallback: (node: HTMLDivElement | null) => void;
};

export const WorkflowUIContext = createContext<WorkflowUIContextValue>({
  mouseInCanvas: false,
  getMousePosition: () => null,
  reactFlowWrapperCallback: () => {}
});

export const WorkflowUIProvider: React.FC<PropsWithChildren> = ({ children }) => {
  // Canvas 交互
  const [mouseInCanvas, setMouseInCanvas] = useState(false);
  const mousePositionRef = useRef<MousePosition | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  /** 读取最新鼠标坐标，避免 mousemove 触发 Context 更新。 */
  const getMousePosition = useCallback(() => mousePositionRef.current, []);

  const reactFlowWrapperCallback = useCallback((node: HTMLDivElement | null) => {
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
        mousePositionRef.current = null;
      };
      const handleMouseMove = (e: MouseEvent) => {
        mousePositionRef.current = { x: e.clientX, y: e.clientY };
      };

      node.addEventListener('mouseenter', handleMouseInCanvas);
      node.addEventListener('mouseleave', handleMouseOutCanvas);
      node.addEventListener('mousemove', handleMouseMove);

      cleanupRef.current = () => {
        node.removeEventListener('mouseenter', handleMouseInCanvas);
        node.removeEventListener('mouseleave', handleMouseOutCanvas);
        node.removeEventListener('mousemove', handleMouseMove);
        setMouseInCanvas(false);
        mousePositionRef.current = null;
      };
    } else {
      (reactFlowWrapper as any).current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  // ---- 演示模式埋点 ----
  const presentationMode = useWorkflowStore((s) => s.presentationMode);
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const nodeAmount = useContextSelector(WorkflowBufferDataContext, (v) => v.nodeAmount);
  useWorkflowDemoTrack(appId, nodeAmount, presentationMode);

  const contextValue = React.useMemo(
    () => ({
      mouseInCanvas,
      getMousePosition,
      reactFlowWrapperCallback
    }),
    [mouseInCanvas, getMousePosition, reactFlowWrapperCallback]
  );

  return <WorkflowUIContext.Provider value={contextValue}>{children}</WorkflowUIContext.Provider>;
};
