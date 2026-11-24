import { useCallback, useEffect, type MutableRefObject } from 'react';
import { useTranslation } from 'next-i18next';
import { useUnmount } from 'ahooks';
import type { StoreWorkflow } from '@fastgpt/global/common/workflow/editor/protocol';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useContextSelector } from 'use-context-selector';
import {
  removeWorkflowLocalDraft,
  saveWorkflowLocalDraft,
  type WorkflowLocalDraft
} from './storage';
import { useWorkflowAuthExpiredDraft } from './useWorkflowAuthExpiredDraft';
import type { WorkflowSaveRequest } from '@/web/core/workflow/editor/session/workflowPersistence';

const enableWorkflowLeaveConfirm = process.env.NEXT_PUBLIC_WORKFLOW_LEAVE_CONFIRM !== 'false';

type UseWorkflowDraftLifecycleProps = {
  appId: string;
  /** 卸载前直接读取 Runtime，防止最新编辑还未反映到 React 的 isSaved。 */
  runtime: WorkflowRuntimePort | null;
  /** host 供给的已保存状态；已保存时不写草稿、不弹离开确认。 */
  isSaved: boolean;
  /** host 的出站序列化入口；草稿与自动保存写的是同一份内容。 */
  serializeWorkflow: () => StoreWorkflow | undefined;
  allowLoginRestore: boolean;
  /** 置 false 表示主动离开，跳过离开保护与自动保存。 */
  leaveSaveSign: MutableRefObject<boolean>;
  /** 本页最后写入的备份，显式保存也按此身份确认是否已覆盖。 */
  writtenDraftRef: MutableRefObject<WorkflowLocalDraft | undefined>;
  /** 创建带当前 Runtime/session/app/revision 的自动保存请求。 */
  createSaveRequest: (appId: string) => WorkflowSaveRequest | undefined;
};

/**
 * host 层的草稿与离开保护生命周期：本地草稿写入/删除、刷新与关闭前的草稿落盘和远端自动保存、
 * 卸载自动保存、鉴权过期草稿提示。返回需要由 host 渲染的弹窗。
 *
 * 卸载自动保存依赖 host 的 Runtime 仍可用，调用方必须保证本 hook 的清理先于 Runtime 释放。
 */
export const useWorkflowDraftLifecycle = ({
  appId,
  runtime,
  isSaved,
  serializeWorkflow,
  allowLoginRestore,
  leaveSaveSign,
  writtenDraftRef,
  createSaveRequest
}: UseWorkflowDraftLifecycleProps) => {
  const { t } = useTranslation();
  const onSaveApp = useContextSelector(AppContext, (v) => v.onSaveApp);
  const hasWritePermission = useContextSelector(
    AppContext,
    (v) => v.appDetail._id === appId && v.appDetail.permission?.hasWritePer
  );
  const { userInfo } = useUserStore();
  const loginTmbId = userInfo?.team?.tmbId;
  const leavePageTip = t('common:core.tip.leave page');

  const isDirty = useCallback(
    () => !isSaved || (!!runtime && !runtime.isDisposed() && runtime.getSavepoint().isDirty),
    [isSaved, runtime]
  );
  const writeLocalDraft = useCallback(
    (data: StoreWorkflow | undefined, restoreAfterLogin = false) => {
      if (!data || !loginTmbId) return;
      const draft = saveWorkflowLocalDraft({ appId, tmbId: loginTmbId, data, restoreAfterLogin });
      if (draft) writtenDraftRef.current = draft;
      return draft;
    },
    [appId, loginTmbId, writtenDraftRef]
  );
  /** 取消浏览器离开提示后，仍可按精确版本丢弃本页刚写下的备份。 */
  const discardWrittenDraft = useCallback(() => {
    const draft = writtenDraftRef.current;
    if (draft?.appId !== appId || draft.tmbId !== loginTmbId) return;
    removeWorkflowLocalDraft(draft);
    writtenDraftRef.current = undefined;
  }, [appId, loginTmbId, writtenDraftRef]);
  const saveAuthExpiredDraft = useCallback(
    () =>
      hasWritePermission && isDirty() && !!writeLocalDraft(serializeWorkflow(), allowLoginRestore),
    [allowLoginRestore, hasWritePermission, isDirty, serializeWorkflow, writeLocalDraft]
  );

  const {
    authExpiredModal,
    handleBeforeUnloadAuthExpired,
    setBeforeUnloadAutoSaving,
    shouldSkipUnmountAutoSave
  } = useWorkflowAuthExpiredDraft({
    leaveSaveSignRef: leaveSaveSign,
    saveLocalDraft: saveAuthExpiredDraft
  });

  /** 先为旧应用落盘，再提交远端；路由切换可能已令旧应用的保存队列失效。 */
  const autoSaveFn = useCallback(
    async ({ fromBeforeUnload = false } = {}) => {
      if (!isDirty() || !leaveSaveSign.current || !hasWritePermission) return;

      const request = createSaveRequest(appId);
      const localDraft = writeLocalDraft(request?.data ?? serializeWorkflow());
      if (!request || request.data.nodes.length === 0) return;

      if (fromBeforeUnload) {
        setBeforeUnloadAutoSaving(true);
      }

      try {
        const saved = await onSaveApp(
          {
            ...request.data,
            isPublish: false,
            autoSave: true
          },
          request
        );
        if (saved && localDraft) {
          // 云端已保存这份备份，即使编辑器已卸载，也可按快照内容精确清理。
          removeWorkflowLocalDraft(localDraft);
          if (writtenDraftRef.current === localDraft) writtenDraftRef.current = undefined;
        }
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
      createSaveRequest,
      hasWritePermission,
      isDirty,
      leaveSaveSign,
      onSaveApp,
      serializeWorkflow,
      setBeforeUnloadAutoSaving,
      writeLocalDraft,
      writtenDraftRef
    ]
  );

  // 普通刷新/关闭页面时先写本地草稿，再弹浏览器原生确认并尝试远端自动保存。
  // 如果是鉴权失败触发的跳登录，弹窗只在用户取消浏览器原生确认、停留在当前页后显示。
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty() || !leaveSaveSign.current) return;

      const { isAuthExpiredRedirecting } = handleBeforeUnloadAuthExpired();

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
  }, [autoSaveFn, handleBeforeUnloadAuthExpired, isDirty, leavePageTip, leaveSaveSign]);

  // 页面关闭前自动保存
  useUnmount(() => {
    if (shouldSkipUnmountAutoSave()) return;

    autoSaveFn();
  });

  return { authExpiredModal, discardWrittenDraft };
};
