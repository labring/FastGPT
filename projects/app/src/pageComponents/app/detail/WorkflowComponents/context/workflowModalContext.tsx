// 工作流功能性弹窗管理层
import React, { type PropsWithChildren, useMemo, useState } from 'react';
import type { OnConnectStartParams } from 'reactflow';
import { createContext, useContextSelector } from 'use-context-selector';
import ChatTest from '../Flow/ChatTest';
import { useDisclosure } from '@chakra-ui/react';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { useUpdateEffect } from 'ahooks';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

export type handleParamsType = OnConnectStartParams & {
  popoverPosition: { x: number; y: number };
  addNodePosition: { x: number; y: number };
};

// 创建 Context
type WorkflowModalContextValue = {
  /** 是否显示历史版本弹窗 */
  showHistoryModal: boolean;

  /** 设置是否显示历史版本弹窗 */
  setShowHistoryModal: React.Dispatch<React.SetStateAction<boolean>>;

  /** 添加节点 Popover 参数 */
  handleParams: handleParamsType | null;

  /** 设置添加节点 Popover 参数 */
  setHandleParams: React.Dispatch<React.SetStateAction<handleParamsType | null>>;

  // chat test
  setWorkflowTestData: React.Dispatch<
    React.SetStateAction<
      | {
          nodes: StoreNodeItemType[];
          edges: StoreEdgeItemType[];
        }
      | undefined
    >
  >;
};
export const WorkflowModalContext = createContext<WorkflowModalContextValue>({
  showHistoryModal: false,
  setShowHistoryModal: function (value: React.SetStateAction<boolean>): void {
    throw new Error('Function not implemented.');
  },
  handleParams: null,
  setHandleParams: function (value: React.SetStateAction<handleParamsType | null>): void {
    throw new Error('Function not implemented.');
  },
  setWorkflowTestData: function (
    value: React.SetStateAction<
      { nodes: StoreNodeItemType[]; edges: StoreEdgeItemType[] } | undefined
    >
  ): void {
    throw new Error('Function not implemented.');
  }
});

export const WorkflowModalProvider = ({ children }: { children: React.ReactNode }) => {
  // 历史版本弹窗
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // 添加节点 Popover 参数
  const [handleParams, setHandleParams] = useState<handleParamsType | null>(null);

  /* chat test */
  const { chatId } = useChatStore();
  const { isOpen: isOpenTest, onOpen: onOpenTest, onClose: onCloseTest } = useDisclosure();
  const [workflowTestData, setWorkflowTestData] = useState<{
    nodes: StoreNodeItemType[];
    edges: StoreEdgeItemType[];
  }>();
  useUpdateEffect(() => {
    onOpenTest();
  }, [workflowTestData]);

  const contextValue = useMemoEnhance(() => {
    console.log('WorkflowModalContextValue 更新了');
    return {
      showHistoryModal,
      setShowHistoryModal,
      handleParams,
      setHandleParams,
      setWorkflowTestData
    };
  }, [showHistoryModal, handleParams]);

  return (
    <WorkflowModalContext.Provider value={contextValue}>
      {children}
      <ChatTest isOpen={isOpenTest} {...workflowTestData} onClose={onCloseTest} chatId={chatId} />
    </WorkflowModalContext.Provider>
  );
};
