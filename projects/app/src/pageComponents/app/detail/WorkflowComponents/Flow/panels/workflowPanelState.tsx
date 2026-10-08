// renderer 层：功能性弹窗状态（历史版本 / 运行预览 / 添加节点 Popover）
import React, { useCallback, useState } from 'react';
import type { OnConnectStartParams } from 'reactflow';
import { createContext, useContextSelector } from 'use-context-selector';
import ChatTest from '../ChatTest';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

export type handleParamsType = OnConnectStartParams & {
  popoverPosition: { x: number; y: number };
  addNodePosition: { x: number; y: number };
};

export type WorkflowActivePanel = 'history' | 'run' | null;

type WorkflowTestData = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
};

type WorkflowModalContextValue = {
  /** 当前打开的右侧工作流弹窗，历史版本与运行预览通过单一状态互斥。 */
  activePanel: WorkflowActivePanel;

  /** 打开指定的工作流面板；同一时刻只保留一个面板。 */
  openPanel: (panel: Exclude<WorkflowActivePanel, null>) => void;

  /** 关闭当前工作流面板。 */
  closePanel: () => void;

  /** 添加节点 Popover 参数。 */
  handleParams: handleParamsType | null;

  /** 打开添加节点 Popover。 */
  openNodeTemplates: (params: handleParamsType) => void;

  /** 关闭添加节点 Popover。 */
  closeNodeTemplates: () => void;

  /** 写入运行预览数据并打开运行预览。 */
  openWorkflowTest: (data: WorkflowTestData) => void;
};

const WorkflowModalContext = createContext<WorkflowModalContextValue>({
  activePanel: null,
  openPanel: function (_panel: Exclude<WorkflowActivePanel, null>): void {
    throw new Error('Function not implemented.');
  },
  closePanel: function (): void {
    throw new Error('Function not implemented.');
  },
  handleParams: null,
  openNodeTemplates: function (_params: handleParamsType): void {
    throw new Error('Function not implemented.');
  },
  closeNodeTemplates: function (): void {
    throw new Error('Function not implemented.');
  },
  openWorkflowTest: function (_data: WorkflowTestData): void {
    throw new Error('Function not implemented.');
  }
});

/** Modal 读取入口；Context 本身不出模块。 */
export const useWorkflowModalValue = <T,>(selector: (value: WorkflowModalContextValue) => T): T =>
  useContextSelector(WorkflowModalContext, selector);

/**
 * 弹窗状态 Provider：管理右侧面板互斥状态、添加节点 Popover 参数与运行预览数据，并渲染 ChatTest 面板。
 * Header 需要读写 activePanel，因此与 WorkflowUIProvider 一起挂在 Header 与画布的共同祖先上。
 */
export const WorkflowModalProvider = ({ children }: { children: React.ReactNode }) => {
  const [activePanel, setActivePanel] = useState<WorkflowActivePanel>(null);
  const [handleParams, setHandleParams] = useState<handleParamsType | null>(null);
  const [workflowTestData, setWorkflowTestDataState] = useState<WorkflowTestData>();
  const { chatId } = useChatStore();

  const openPanel = useCallback((panel: Exclude<WorkflowActivePanel, null>) => {
    setActivePanel(panel);
  }, []);
  const closePanel = useCallback(() => setActivePanel(null), []);
  const openNodeTemplates = useCallback((params: handleParamsType) => {
    setHandleParams(params);
  }, []);
  const closeNodeTemplates = useCallback(() => setHandleParams(null), []);
  const openWorkflowTest = useCallback((data: WorkflowTestData) => {
    setWorkflowTestDataState(data);
    setActivePanel('run');
  }, []);

  const contextValue = useMemoEnhance(
    () => ({
      activePanel,
      openPanel,
      closePanel,
      handleParams,
      openNodeTemplates,
      closeNodeTemplates,
      openWorkflowTest
    }),
    [
      activePanel,
      openPanel,
      closePanel,
      handleParams,
      openNodeTemplates,
      closeNodeTemplates,
      openWorkflowTest
    ]
  );

  return (
    <WorkflowModalContext.Provider value={contextValue}>
      {children}
      <ChatTest
        isOpen={activePanel === 'run'}
        {...workflowTestData}
        onClose={closePanel}
        chatId={chatId}
      />
    </WorkflowModalContext.Provider>
  );
};
