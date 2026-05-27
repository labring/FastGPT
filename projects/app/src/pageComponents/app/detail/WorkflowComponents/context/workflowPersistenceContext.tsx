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
import { Box, Button } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
import { useDebounceEffect, useUnmount } from 'ahooks';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { WorkflowBufferDataContext, WorkflowInitContext } from './workflowInitContext';
import { compareSnapshot } from '@/web/core/workflow/utils';
import { AppContext } from '@/pageComponents/app/detail/context';
import { WorkflowSnapshotContext } from './workflowSnapshotContext';
import { WorkflowUtilsContext } from './workflowUtilsContext';
import {
  removeWorkflowLocalDraftByApp,
  saveWorkflowLocalDraft
} from '@/web/core/workflow/localDraft';
import { postPublishApp } from '@/web/core/app/api/version';
import { useUserStore } from '@/web/support/user/useUserStore';
import { AUTH_ERROR_EVENT_NAME, type AuthErrorEventDetail } from '@/web/common/api/request';
import { safeEncodeURIComponent } from '@/web/common/utils/uri';

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
  const router = useRouter();
  // 获取依赖的 context
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);
  const { userInfo } = useUserStore();
  const { past, future } = useContextSelector(WorkflowSnapshotContext, (v) => v);
  const loginTmbId = userInfo?.team?.tmbId;

  // 保存状态
  const [isSaved, setIsSaved] = useState(true);
  const [showAuthExpiredModal, setShowAuthExpiredModal] = useState(false);
  // 离开保存标志
  const leaveSaveSign = useRef(true);
  const authExpiredRedirecting = useRef(false);
  const authExpiredDraftSaved = useRef(false);
  const beforeUnloadAutoSaving = useRef(false);
  const authExpiredModalTimer = useRef<number>();
  const flowData2StoreData = useContextSelector(WorkflowUtilsContext, (v) => v.flowData2StoreData);
  const leavePageTip = t('common:core.tip.leave page');

  const saveLocalDraft = useCallback(() => {
    const data = flowData2StoreData();
    if (!data || !loginTmbId) return false;

    return saveWorkflowLocalDraft({
      appId: appDetail._id,
      // 团队切换会立即改写全站共享 cookie/session；草稿恢复必须和保存草稿时的 tmbId 对齐。
      tmbId: loginTmbId,
      data: {
        ...data,
        chatConfig: appDetail.chatConfig
      }
    });
  }, [appDetail._id, appDetail.chatConfig, flowData2StoreData, loginTmbId]);

  const removeCurrentLocalDraft = useCallback(() => {
    removeWorkflowLocalDraftByApp({
      appId: appDetail._id
    });
  }, [appDetail._id]);

  const getLoginRoute = useCallback(() => {
    return `/login?lastRoute=${safeEncodeURIComponent(location.pathname + location.search)}`;
  }, []);

  const showAuthExpiredNotice = useCallback(() => {
    window.clearTimeout(authExpiredModalTimer.current);
    authExpiredModalTimer.current = window.setTimeout(() => {
      setShowAuthExpiredModal(true);
    });
  }, []);

  useEffect(() => {
    const handleAuthError = (event: Event) => {
      const detail = (event as CustomEvent<AuthErrorEventDetail>).detail;
      const savedDraft = saveLocalDraft();
      if (!savedDraft && !authExpiredDraftSaved.current) return;

      authExpiredDraftSaved.current = savedDraft || authExpiredDraftSaved.current;

      if (authExpiredRedirecting.current || beforeUnloadAutoSaving.current) {
        // 已进入鉴权失败处理，或当前 403 来自 beforeunload 自动保存：不再触发登录跳转，避免系统弹窗循环。
        authExpiredRedirecting.current = true;
        detail.skipClearToken = true;
        detail.skipRedirect = true;
        showAuthExpiredNotice();
        return;
      }

      authExpiredRedirecting.current = true;
      // 首次 403 仍允许请求拦截器触发登录跳转，从而只出现一次浏览器离开确认；但跳过 logout 请求避免二次跳转。
      detail.skipClearToken = true;
    };

    window.addEventListener(AUTH_ERROR_EVENT_NAME, handleAuthError);
    return () => {
      window.removeEventListener(AUTH_ERROR_EVENT_NAME, handleAuthError);
    };
  }, [saveLocalDraft, showAuthExpiredNotice]);

  useEffect(() => {
    return () => {
      window.clearTimeout(authExpiredModalTimer.current);
    };
  }, []);

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
  const autoSaveFn = useCallback(
    async ({ fromBeforeUnload = false } = {}) => {
      if (isSaved || !leaveSaveSign.current) return;
      console.log('Leave auto save');
      const data = flowData2StoreData();
      if (!data || data.nodes.length === 0) return;

      if (fromBeforeUnload) {
        beforeUnloadAutoSaving.current = true;
      }

      try {
        if (!appDetail.permission.hasWritePer) {
          return;
        }
        await postPublishApp(appDetail._id, {
          ...data,
          isPublish: false,
          chatConfig: appDetail.chatConfig,
          autoSave: true
        });
        removeCurrentLocalDraft();
      } catch (error) {
        console.warn('[Workflow auto save] Failed to save workflow before leaving:', error);
      } finally {
        if (fromBeforeUnload) {
          beforeUnloadAutoSaving.current = false;
        }
      }
    },
    [
      appDetail._id,
      appDetail.chatConfig,
      appDetail.permission.hasWritePer,
      flowData2StoreData,
      isSaved,
      removeCurrentLocalDraft
    ]
  );

  // 普通刷新/关闭页面时先写本地草稿，再弹浏览器原生确认并尝试远端自动保存。
  // 如果是鉴权失败触发的跳登录，弹窗只在用户取消浏览器原生确认、停留在当前页后显示。
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isSaved || !leaveSaveSign.current) return;

      if (authExpiredRedirecting.current && authExpiredDraftSaved.current) {
        showAuthExpiredNotice();
      } else if (appDetail.permission.hasWritePer) {
        saveLocalDraft();
      }

      if (!authExpiredRedirecting.current) {
        autoSaveFn({ fromBeforeUnload: true });
      }

      event.preventDefault();
      event.returnValue = leavePageTip;
      return leavePageTip;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [
    appDetail.permission.hasWritePer,
    autoSaveFn,
    isSaved,
    leavePageTip,
    saveLocalDraft,
    showAuthExpiredNotice
  ]);

  const handleRelogin = useCallback(() => {
    leaveSaveSign.current = false;
    authExpiredRedirecting.current = false;
    beforeUnloadAutoSaving.current = false;
    window.clearTimeout(authExpiredModalTimer.current);
    router.replace(getLoginRoute());
  }, [getLoginRoute, router]);

  const handleCancelRelogin = useCallback(() => {
    setShowAuthExpiredModal(false);
  }, []);

  // 页面关闭前自动保存
  useUnmount(() => {
    if (authExpiredRedirecting.current) return;

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
      {showAuthExpiredModal && (
        <MyModal
          isOpen
          isCentered
          size={'sm'}
          title={t('workflow:workflow_local_draft_auth_expired_title')}
          showCloseButton={false}
          closeOnOverlayClick={false}
          borderRadius={'10px'}
          footer={
            <>
              <Button variant={'whiteBase'} onClick={handleCancelRelogin}>
                {t('common:Cancel')}
              </Button>
              <Button onClick={handleRelogin}>{t('workflow:workflow_local_draft_relogin')}</Button>
            </>
          }
        >
          <Box>{t('workflow:workflow_local_draft_auth_expired_notice')}</Box>
        </MyModal>
      )}
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
