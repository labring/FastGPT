import { useCallback, useEffect, type MutableRefObject } from 'react';
import { useTranslation } from 'next-i18next';
import { useUnmount } from 'ahooks';
import type { StoreWorkflow } from '@fastgpt/global/core/workflow/editor/protocol';
import { AppContext } from '@/pageComponents/app/detail/context';
import { postPublishApp } from '@/web/core/app/api/version';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useContextSelector } from 'use-context-selector';
import { removeWorkflowLocalDraftByApp, saveWorkflowLocalDraft } from './storage';
import { useWorkflowAuthExpiredDraft } from './useWorkflowAuthExpiredDraft';

const enableWorkflowLeaveConfirm = process.env.NEXT_PUBLIC_WORKFLOW_LEAVE_CONFIRM !== 'false';

type UseWorkflowDraftLifecycleProps = {
  /** host 供给的已保存状态；已保存时不写草稿、不弹离开确认。 */
  isSaved: boolean;
  /** host 的出站序列化入口；草稿与自动保存写的是同一份内容。 */
  serializeWorkflow: () => StoreWorkflow | undefined;
  /** 置 false 表示主动离开，跳过离开保护与自动保存。 */
  leaveSaveSign: MutableRefObject<boolean>;
};

/**
 * host 层的草稿与离开保护生命周期：本地草稿写入/删除、刷新与关闭前的草稿落盘和远端自动保存、
 * 卸载自动保存、鉴权过期草稿提示。返回需要由 host 渲染的弹窗。
 *
 * 卸载自动保存依赖 host 的 Runtime 仍可用，调用方必须保证本 hook 的清理先于 Runtime 释放。
 */
export const useWorkflowDraftLifecycle = ({
  isSaved,
  serializeWorkflow,
  leaveSaveSign
}: UseWorkflowDraftLifecycleProps) => {
  const { t } = useTranslation();
  const appId = useContextSelector(AppContext, (v) => v.appDetail._id);
  const hasWritePermission = useContextSelector(
    AppContext,
    (v) => v.appDetail.permission.hasWritePer
  );
  const { userInfo } = useUserStore();
  const loginTmbId = userInfo?.team?.tmbId;
  const leavePageTip = t('common:core.tip.leave page');

  const saveLocalDraft = useCallback(() => {
    const data = serializeWorkflow();
    if (!data || !loginTmbId) return false;

    return saveWorkflowLocalDraft({
      appId,
      // 团队切换会立即改写全站共享 cookie/session；草稿恢复必须和保存草稿时的 tmbId 对齐。
      tmbId: loginTmbId,
      data
    });
  }, [appId, serializeWorkflow, loginTmbId]);

  const removeCurrentLocalDraft = useCallback(() => {
    removeWorkflowLocalDraftByApp({
      appId
    });
  }, [appId]);

  const {
    authExpiredModal,
    handleBeforeUnloadAuthExpired,
    setBeforeUnloadAutoSaving,
    shouldSkipUnmountAutoSave
  } = useWorkflowAuthExpiredDraft({
    leaveSaveSignRef: leaveSaveSign,
    saveLocalDraft
  });

  useEffect(() => {
    if (isSaved) {
      removeCurrentLocalDraft();
    }
  }, [isSaved, removeCurrentLocalDraft]);

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
      const data = serializeWorkflow();
      if (!data || data.nodes.length === 0) return;

      if (fromBeforeUnload) {
        setBeforeUnloadAutoSaving(true);
      }

      try {
        if (!hasWritePermission) {
          return;
        }
        await postPublishApp(appId, {
          ...data,
          isPublish: false,
          autoSave: true
        });
        removeCurrentLocalDraft();
      } catch (error) {
        console.warn('[Workflow auto save] Failed to save workflow before leaving:', error);
      } finally {
        if (fromBeforeUnload) {
          setBeforeUnloadAutoSaving(false);
        }
      }
    },
    [
      appId,
      hasWritePermission,
      serializeWorkflow,
      isSaved,
      leaveSaveSign,
      removeCurrentLocalDraft,
      setBeforeUnloadAutoSaving
    ]
  );

  // 普通刷新/关闭页面时先写本地草稿，再弹浏览器原生确认并尝试远端自动保存。
  // 如果是鉴权失败触发的跳登录，弹窗只在用户取消浏览器原生确认、停留在当前页后显示。
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isSaved || !leaveSaveSign.current) return;

      const { isAuthExpiredRedirecting } = handleBeforeUnloadAuthExpired();

      if (!isAuthExpiredRedirecting && hasWritePermission) {
        saveLocalDraft();
      }

      if (!isAuthExpiredRedirecting) {
        autoSaveFn({ fromBeforeUnload: true });
      }

      if (!enableWorkflowLeaveConfirm) return;

      event.preventDefault();
      event.returnValue = leavePageTip;
      return leavePageTip;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [
    hasWritePermission,
    autoSaveFn,
    handleBeforeUnloadAuthExpired,
    isSaved,
    leavePageTip,
    saveLocalDraft,
    leaveSaveSign
  ]);

  // 页面关闭前自动保存
  useUnmount(() => {
    if (shouldSkipUnmountAutoSave()) return;

    autoSaveFn();
  });

  return { authExpiredModal };
};
