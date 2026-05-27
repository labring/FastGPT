import { useCallback, useEffect } from 'react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { UserType } from '@fastgpt/global/support/user/type';
import { postPublishApp } from '@/web/core/app/api/version';
import {
  checkWorkflowLocalDraft,
  consumeWorkflowLocalDraftSavedNotice,
  removeWorkflowLocalDraft
} from '@/web/core/workflow/localDraft';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getLastAuthTmbId } from '@/web/support/user/lastTmbIdStorage';

const DEFAULT_LOGIN_ROUTE = '/dashboard/agent';

/**
 * 登录成功后只在最近一次已登录 tmbId 与当前 tmbId 一致时恢复工作流草稿。
 * 恢复请求失败时保留草稿且不跳转，方便用户重试。
 */
export const restoreWorkflowLocalDraftAfterLogin = async ({
  user,
  fallbackRoute,
  saveDraft,
  onRestoreFailed
}: {
  user: UserType;
  fallbackRoute: string;
  saveDraft: typeof postPublishApp;
  onRestoreFailed?: (error: unknown) => void;
}): Promise<string | undefined> => {
  const lastAuthTmbId = getLastAuthTmbId();
  if (!lastAuthTmbId) {
    return fallbackRoute;
  }

  if (lastAuthTmbId !== user.team?.tmbId) {
    removeWorkflowLocalDraft();
    return DEFAULT_LOGIN_ROUTE;
  }

  const draftResult = checkWorkflowLocalDraft();

  if (draftResult.status !== 'matched') {
    return fallbackRoute;
  }

  try {
    await saveDraft(draftResult.draft.appId, {
      ...draftResult.draft.data,
      isPublish: false,
      autoSave: true
    });
    removeWorkflowLocalDraft();
    return draftResult.route;
  } catch (error) {
    onRestoreFailed?.(error);
    return undefined;
  }
};

export const useWorkflowLocalDraftRestore = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { runAsync: saveWorkflowLocalDraft } = useRequest(postPublishApp, {
    manual: true
  });

  useEffect(() => {
    if (!consumeWorkflowLocalDraftSavedNotice()) return;

    toast({
      status: 'success',
      title: t('login:workflow_local_draft_saved')
    });
  }, [t, toast]);

  return useCallback(
    async ({
      user,
      fallbackRoute
    }: {
      user: UserType;
      fallbackRoute: string;
    }): Promise<string | undefined> => {
      return restoreWorkflowLocalDraftAfterLogin({
        user,
        fallbackRoute,
        saveDraft: saveWorkflowLocalDraft
      });
    },
    [saveWorkflowLocalDraft]
  );
};
