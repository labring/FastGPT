// renderer 层：画布交互状态（hover、右键菜单、控制模式、演示模式、鼠标位置）
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useLocalStorageState } from 'ahooks';
import React, { type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useWorkflowSnapshot } from '@/web/core/workflow/editor/session/workflowSession';
import { useWorkflowDemoTrack } from '@/web/common/middle/tracks/workflowDemoTrack';
import type { OnConnectStartParams } from 'reactflow';
import type { NodeTemplateContext } from '@fastgpt/global/core/workflow/type/node';

// region canvasContext Canvas interaction context contract

type MousePosition = { x: number; y: number };
export type ContextMenuPosition = { top: number; left: number };

/**
 * 连线拖拽状态：源 handle 参数 + 拖拽开始时由 Runtime 算好的 placement context。
 * context 只算一次，目标柄按 target 应用纯规则；null 表示无法建立上下文，按「允许」处理。
 */
export type ConnectingEdgeState = OnConnectStartParams & {
  context: NodeTemplateContext | null;
};

// 创建 Context
type WorkflowUIContextValue = {
  /** 悬停的节点 ID */
  hoverNodeId?: string;

  /** 设置悬停的节点 ID */
  setHoverNodeId: (nodeId?: string) => void;

  /** 悬停的边 ID */
  hoverEdgeId?: string;

  /** 设置悬停的边 ID */
  setHoverEdgeId: (edgeId?: string) => void;

  /** 正在拖拽连线的源 handle 与 placement context；连接柄高亮与可连接判定都读它 */
  connectingEdge?: ConnectingEdgeState;

  /** 设置正在拖拽连线的源 handle */
  setConnectingEdge: (state?: ConnectingEdgeState) => void;

  /** 鼠标是否在 Canvas 中 */
  mouseInCanvas: boolean;

  /** 获取鼠标在 Canvas 中的最新屏幕位置 */
  getMousePosition: () => MousePosition | null;

  /** ReactFlow 包装器 callback ref */
  reactFlowWrapperCallback: (node: HTMLDivElement | null) => void;

  /** 工作流控制模式 */
  workflowControlMode: 'drag' | 'select';

  /** 设置工作流控制模式 */
  setWorkflowControlMode: (value: 'drag' | 'select') => void;

  /** 演示模式 */
  presentationMode: boolean;

  /** 设置演示模式 */
  setPresentationMode: (enabled: boolean) => void;

  /** 右键菜单 */
  menu: ContextMenuPosition | null;

  /** 设置右键菜单 */
  openContextMenu: (position: ContextMenuPosition) => void;
  closeContextMenu: () => void;
};
const WorkflowUIContext = createContext<WorkflowUIContextValue>({
  setHoverNodeId: function (_nodeId?: string): void {
    throw new Error('Function not implemented.');
  },
  setHoverEdgeId: function (_edgeId?: string): void {
    throw new Error('Function not implemented.');
  },
  setConnectingEdge: function (_state?: ConnectingEdgeState): void {
    throw new Error('Function not implemented.');
  },
  mouseInCanvas: false,
  getMousePosition: () => null,
  reactFlowWrapperCallback: function (_node: HTMLDivElement | null): void {
    throw new Error('Function not implemented.');
  },
  workflowControlMode: 'drag',
  setWorkflowControlMode: function (_value: 'drag' | 'select'): void {
    throw new Error('Function not implemented.');
  },
  presentationMode: false,
  setPresentationMode: function (_enabled: boolean): void {
    throw new Error('Function not implemented.');
  },
  menu: null,
  openContextMenu: function (_position: ContextMenuPosition): void {
    throw new Error('Function not implemented.');
  },
  closeContextMenu: function (): void {
    throw new Error('Function not implemented.');
  }
});

/** UI 交互读取入口；Context 本身不出模块，调用方只能选择语义字段。 */
export const useWorkflowUIValue = <T,>(selector: (value: WorkflowUIContextValue) => T): T =>
  useContextSelector(WorkflowUIContext, selector);

/**
 * 画布交互状态 Provider：只承载 renderer 层的瞬时交互状态，不持有工作流文档数据。
 * 画布与 Header 都要读写弹窗/交互状态，挂载点取两者的共同祖先（Workflow / Plugin 页面的 WorkflowEdit）。
 */
export const WorkflowUIProvider: React.FC<PropsWithChildren> = ({ children }) => {
  // 悬停状态 (高频更新)
  const [hoverNodeId, setHoverNodeId] = useState<string>();
  const [hoverEdgeId, setHoverEdgeId] = useState<string>();
  // 拖拽连线是纯 renderer 交互状态：只在手势期间存在，不进文档。
  const [connectingEdge, setConnectingEdge] = useState<ConnectingEdgeState>();

  // Canvas 交互
  const [mouseInCanvas, setMouseInCanvas] = useState(false);
  const mousePositionRef = useRef<MousePosition | null>(null);
  // 使用 ref 来存储 wrapper 引用和 cleanup 函数
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  /** 读取最新鼠标坐标，避免 mousemove 触发 Context 更新。 */
  const getMousePosition = useCallback(() => mousePositionRef.current, []);

  const reactFlowWrapperCallback = useCallback((node: HTMLDivElement | null) => {
    // 先清理旧的事件监听器
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (node) {
      reactFlowWrapper.current = node;

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

      // 存储 cleanup 函数到 ref
      cleanupRef.current = () => {
        node.removeEventListener('mouseenter', handleMouseInCanvas);
        node.removeEventListener('mouseleave', handleMouseOutCanvas);
        node.removeEventListener('mousemove', handleMouseMove);
        setMouseInCanvas(false);
        mousePositionRef.current = null;
      };
    } else {
      reactFlowWrapper.current = null;
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

  // ---- 演示模式埋点 ----
  const appId = useContextSelector(AppContext, (v) => v.appId);
  // 埋点用的节点数走结构通道并只返回原始值：节点数只随增删变化，
  // 订阅语义快照会让 Provider 在每一笔字段提交后都白跑一次函数。
  // 埋点用的节点数只能走 host 语义通道：这一层 Provider 在 runtime hydrate 之前就要渲染
  // （`initRuntime` 在页面的 `useMount` 里），而 adapter hook 在 adapter 挂上之前一律抛错。
  // 快照换身份只是让 Provider 函数体空跑一次——children 元素身份不变、contextValue 有 memo，
  // 子树不会跟着重渲染，所以这里换成结构通道没有实际收益。
  const nodeAmount = useWorkflowSnapshot()?.nodes.length ?? 0;
  useWorkflowDemoTrack(appId, nodeAmount, presentationMode);

  // 右键菜单
  const [menu, setMenu] = useState<ContextMenuPosition | null>(null);
  const setHoverNodeIdValue = useCallback((nodeId?: string) => setHoverNodeId(nodeId), []);
  const setHoverEdgeIdValue = useCallback((edgeId?: string) => setHoverEdgeId(edgeId), []);
  const setConnectingEdgeValue = useCallback(
    (state?: ConnectingEdgeState) => setConnectingEdge(state),
    []
  );
  const setWorkflowControlModeValue = useCallback(
    (value: 'drag' | 'select') => setWorkflowControlMode(value),
    [setWorkflowControlMode]
  );
  const setPresentationModeValue = useCallback(
    (enabled: boolean) => setPresentationMode(enabled),
    []
  );
  const openContextMenu = useCallback((position: ContextMenuPosition) => setMenu(position), []);
  const closeContextMenu = useCallback(() => setMenu(null), []);

  const contextValue = useMemoEnhance(() => {
    return {
      hoverNodeId,
      setHoverNodeId: setHoverNodeIdValue,
      hoverEdgeId,
      setHoverEdgeId: setHoverEdgeIdValue,
      connectingEdge,
      setConnectingEdge: setConnectingEdgeValue,
      mouseInCanvas,
      getMousePosition,
      reactFlowWrapperCallback,
      workflowControlMode,
      setWorkflowControlMode: setWorkflowControlModeValue,
      presentationMode,
      setPresentationMode: setPresentationModeValue,
      menu,
      openContextMenu,
      closeContextMenu
    };
  }, [
    hoverNodeId,
    hoverEdgeId,
    connectingEdge,
    mouseInCanvas,
    getMousePosition,
    reactFlowWrapperCallback,
    workflowControlMode,
    setWorkflowControlModeValue,
    presentationMode,
    menu,
    openContextMenu,
    closeContextMenu
  ]);

  return <WorkflowUIContext.Provider value={contextValue}>{children}</WorkflowUIContext.Provider>;
};

// endregion
