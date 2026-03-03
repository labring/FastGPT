/**
 * WorkflowPersistenceContext - 工作流持久化层
 * @description 提供数据持久化和自动保存功能
 * @author FastGPT Team
 * @date 2025-01-18
 */

import React, {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { useDebounceEffect, useMemoizedFn, useUnmount } from 'ahooks';
import { WorkflowBufferDataContext, WorkflowInitContext } from './workflowInitContext';
import { compareSnapshot } from '@/web/core/workflow/utils';
import { AppContext } from '@/pageComponents/app/detail/context';
import { WorkflowSnapshotContext } from './workflowSnapshotContext';
import { WorkflowUtilsContext } from './workflowUtilsContext';
import { isProduction } from '@fastgpt/global/common/system/constants';
import { useTranslation } from 'next-i18next';
import { useBeforeunload } from '@fastgpt/web/hooks/useBeforeunload';

// 创建 Context
type WorkflowPersistenceContextValue = {
  /** 是否已保存 */
  isSaved: boolean;

  /** 离开保存标志 */
  leaveSaveSign: React.MutableRefObject<boolean>;
};
export const WorkflowPersistenceContext = createContext<WorkflowPersistenceContextValue>({
  isSaved: true,
  leaveSaveSign: { current: true }
});

/**
 * WorkflowPersistenceProvider - 持久化提供者
 */
export const WorkflowPersistenceProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const { t } = useTranslation();
  // 获取依赖的 context
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);
  const { past, future } = useContextSelector(WorkflowSnapshotContext, (v) => v);

  // 保存状态
  const [isSaved, setIsSaved] = useState(true);
  // 离开保存标志
  const leaveSaveSign = useRef(true);

  /**
   * 计算 isSaved 状态 - 防抖 500ms
   * 当前状态与已保存快照比较
   */
  useDebounceEffect(
    () => {
      const savedSnapshot =
        [...future].reverse().find((snapshot) => snapshot.isSaved) ||
        past.find((snapshot) => snapshot.isSaved);

      const val = compareSnapshot(
        {
          nodes: savedSnapshot?.nodes,
          edges: savedSnapshot?.edges,
          chatConfig: savedSnapshot?.chatConfig
        },
        {
          nodes,
          edges,
          chatConfig: appDetail.chatConfig
        }
      );
      setIsSaved(val);
    },
    [future, past, nodes, edges, appDetail.chatConfig],
    {
      wait: 500
    }
  );

  /**
   * 自动保存函数
   * 触发条件:
   * 1. 手动调用
   * 2. 离开页面前
   */
  const flowData2StoreData = useContextSelector(WorkflowUtilsContext, (v) => v.flowData2StoreData);
  const onSaveApp = useContextSelector(AppContext, (v) => v.onSaveApp);
  const autoSaveFn = useCallback(async () => {
    if (isSaved || !leaveSaveSign.current) return;
    console.log('Leave auto save');
    const data = flowData2StoreData();
    if (!data || data.nodes.length === 0) return;
    await onSaveApp({
      ...data,
      isPublish: false,
      chatConfig: appDetail.chatConfig,
      autoSave: true
    });
  }, [appDetail.chatConfig, flowData2StoreData, isSaved, onSaveApp]);

  // 页面关闭前自动保存
  useUnmount(() => {
    autoSaveFn();
  });

  useBeforeunload({
    tip: t('common:core.tip.leave page'),
    callback: autoSaveFn
  });

  const contextValue = useMemo(() => {
    console.log('WorkflowPersistenceContextValue 更新了');
    return {
      isSaved,
      leaveSaveSign
    };
  }, [isSaved]);

  return (
    <WorkflowPersistenceContext.Provider value={contextValue}>
      {children}
    </WorkflowPersistenceContext.Provider>
  );
};

/**
 * useWorkflowPersistence - 使用工作流持久化
 */
export const useWorkflowPersistence = () => {
  const context = useContextSelector(WorkflowPersistenceContext, (v) => v);
  if (!context) {
    throw new Error('useWorkflowPersistence must be used within WorkflowPersistenceProvider');
  }
  return context;
};
