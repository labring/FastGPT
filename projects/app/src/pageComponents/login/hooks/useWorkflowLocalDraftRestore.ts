import { useCallback } from 'react';
import type { UserType } from '@fastgpt/global/support/user/type';
import { postPublishApp } from '@/web/core/app/api/version';
import {
  checkWorkflowLocalDraft,
  type WorkflowLocalDraft,
  removeWorkflowLocalDraft
} from '@/web/core/workflow/localDraft';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getLastAuthTmbId } from '@/web/support/user/lastTmbIdStorage';

const DEFAULT_LOGIN_ROUTE = '/dashboard/agent';
const WORKFLOW_DRAFT_RESTORE_SAVE_MAX_RETRY = 3;

const getSafeFallbackRouteAfterLogin = ({
  user,
  fallbackRoute
}: {
  user: UserType;
  fallbackRoute: string;
}) => {
  const lastAuthTmbId = getLastAuthTmbId();
  if (lastAuthTmbId && lastAuthTmbId !== user.team?.tmbId) {
    return DEFAULT_LOGIN_ROUTE;
  }

  return fallbackRoute;
};

const saveWorkflowDraftWithRetry = async ({
  draft,
  saveDraft
}: {
  draft: WorkflowLocalDraft;
  saveDraft: typeof postPublishApp;
}) => {
  for (let retryCount = 0; retryCount < WORKFLOW_DRAFT_RESTORE_SAVE_MAX_RETRY; retryCount++) {
    try {
      await saveDraft(draft.appId, {
        ...draft.data,
        isPublish: false,
        autoSave: true
      });
      return;
    } catch {
      // 失败时静默进入下一次重试；重试耗尽后由调用方继续跳转。
    }
  }
};

/**
 * 登录成功后的回跳规则：
 * 1. 有工作流草稿时，只恢复 tmbId 与当前登录团队一致的草稿；
 * 2. 未命中工作流草稿恢复时，用全局最近登录 tmbId 拦截跨团队 lastRoute 跳转；
 * 3. 身份一致或没有历史身份记录时，继续使用登录流程给出的 fallbackRoute。
 * 恢复请求最多重试 3 次；仍失败时丢弃本地草稿并继续跳转。
 */
export const restoreWorkflowLocalDraftAfterLogin = async ({
  user,
  fallbackRoute,
  saveDraft
}: {
  user: UserType;
  fallbackRoute: string;
  saveDraft: typeof postPublishApp;
}): Promise<string | undefined> => {
  const draftResult = checkWorkflowLocalDraft();

  if (draftResult.status !== 'matched') {
    return getSafeFallbackRouteAfterLogin({ user, fallbackRoute });
  }

  const draftTmbId = draftResult.draft.tmbId;

  // 草稿以保存时的 tmbId 为准，避免其他标签页切团队后污染登录恢复。
  if (draftTmbId !== user.team?.tmbId) {
    removeWorkflowLocalDraft();
    return getSafeFallbackRouteAfterLogin({ user, fallbackRoute });
  }

  await saveWorkflowDraftWithRetry({
    draft: draftResult.draft,
    saveDraft
  });

  removeWorkflowLocalDraft();

  return draftResult.route;
};

export const useWorkflowLocalDraftRestore = () => {
  const { runAsync: saveWorkflowLocalDraft } = useRequest(postPublishApp, {
    manual: true,
    errorToast: ''
  });

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
