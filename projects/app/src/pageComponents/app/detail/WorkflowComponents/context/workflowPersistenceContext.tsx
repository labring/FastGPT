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
import { useDebounceEffect, useUnmount } from 'ahooks';
import { WorkflowBufferDataContext, WorkflowInitContext } from './workflowInitContext';
import { compareSnapshot } from '@/web/core/workflow/utils';
import { AppContext } from '@/pageComponents/app/detail/context';
import { WorkflowSnapshotContext } from './workflowSnapshotContext';
import { WorkflowUtilsContext } from './workflowUtilsContext';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  getWorkflowLocalDraftIdentity,
  markWorkflowLocalDraftSavedNotice,
  removeWorkflowLocalDraftByApp,
  saveWorkflowLocalDraft
} from '@/web/core/workflow/localDraft';
import { TOKEN_ERROR_CODE } from '@fastgpt/global/common/error/errorCode';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { postPublishApp } from '@/web/core/app/api/version';

const isAuthRedirectError = (error: any) => {
  return (
    (typeof error?.code === 'number' && error.code in TOKEN_ERROR_CODE) ||
    error?.message === i18nT('common:unauth_token')
  );
};

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
  // 获取依赖的 context
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);
  const { past, future } = useContextSelector(WorkflowSnapshotContext, (v) => v);

  // 保存状态
  const [isSaved, setIsSaved] = useState(true);
  // 离开保存标志
  const leaveSaveSign = useRef(true);
  // 离开自动保存触发鉴权跳登录时，不能再弹浏览器原生离开确认。
  const suppressBeforeUnloadPrompt = useRef(false);
  const userInfo = useUserStore((state) => state.userInfo);
  const flowData2StoreData = useContextSelector(WorkflowUtilsContext, (v) => v.flowData2StoreData);

  const saveLocalDraft = useCallback(() => {
    const identity = getWorkflowLocalDraftIdentity(userInfo);
    const data = flowData2StoreData();
    if (!data) return false;

    return saveWorkflowLocalDraft({
      appId: appDetail._id,
      identity,
      data: {
        ...data,
        chatConfig: appDetail.chatConfig
      }
    });
  }, [appDetail._id, appDetail.chatConfig, flowData2StoreData, userInfo]);

  const removeCurrentLocalDraft = useCallback(() => {
    removeWorkflowLocalDraftByApp({
      appId: appDetail._id,
      identity: getWorkflowLocalDraftIdentity(userInfo)
    });
  }, [appDetail._id, userInfo]);

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

      if (val) {
        removeCurrentLocalDraft();
      }
    },
    [future, past, nodes, edges, appDetail.chatConfig, removeCurrentLocalDraft],
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
  const autoSaveFn = useCallback(async () => {
    if (isSaved || !leaveSaveSign.current) return;
    console.log('Leave auto save');
    const data = flowData2StoreData();
    if (!data || data.nodes.length === 0) return;
    suppressBeforeUnloadPrompt.current = true;
    try {
      if (!appDetail.permission.hasWritePer) {
        suppressBeforeUnloadPrompt.current = false;
        return;
      }
      await postPublishApp(appDetail._id, {
        ...data,
        isPublish: false,
        chatConfig: appDetail.chatConfig,
        autoSave: true
      });
      suppressBeforeUnloadPrompt.current = false;
      removeCurrentLocalDraft();
    } catch (error) {
      if (isAuthRedirectError(error)) {
        const savedDraft = saveLocalDraft();
        if (savedDraft) {
          markWorkflowLocalDraftSavedNotice();
        }
        return;
      }

      suppressBeforeUnloadPrompt.current = false;
    }
  }, [
    appDetail._id,
    appDetail.chatConfig,
    appDetail.permission.hasWritePer,
    flowData2StoreData,
    isSaved,
    removeCurrentLocalDraft,
    saveLocalDraft
  ]);

  // 普通刷新/关闭页面触发一次远端自动保存；不再使用浏览器原生离开确认弹窗。
  // 如果远端自动保存已因鉴权失败写入本地草稿，后续登录跳转继续补一次本地草稿保存。
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isSaved || !leaveSaveSign.current) return;

      if (suppressBeforeUnloadPrompt.current) {
        saveLocalDraft();
      } else {
        autoSaveFn();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [autoSaveFn, isSaved, saveLocalDraft]);

  // 页面关闭前自动保存
  useUnmount(() => {
    autoSaveFn();
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
