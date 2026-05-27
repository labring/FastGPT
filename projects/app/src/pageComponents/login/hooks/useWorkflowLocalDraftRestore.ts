import { useCallback } from 'react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { UserType } from '@fastgpt/global/support/user/type';
import { postPublishApp } from '@/web/core/app/api/version';
import { checkWorkflowLocalDraft, removeWorkflowLocalDraft } from '@/web/core/workflow/localDraft';
import { getErrText } from '@fastgpt/global/common/error/utils';

/**
 * 登录成功后只要检测到同 username 的工作流草稿就尝试恢复。
 * 账号不匹配的草稿会丢弃；恢复请求失败时保留草稿且不跳转，方便用户重试。
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
  const draftResult = checkWorkflowLocalDraft({
    user
  });

  if (draftResult.status === 'account-mismatch') {
    removeWorkflowLocalDraft();
    return fallbackRoute;
  }

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
        saveDraft: postPublishApp,
        onRestoreFailed: (error) =>
          toast({
            status: 'warning',
            title: getErrText(error)
          })
      });
    },
    [toast]
  );
};
