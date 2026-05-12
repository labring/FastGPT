import { useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { UserType } from '@fastgpt/global/support/user/type';
import { postPublishApp } from '@/web/core/app/api/version';
import { checkWorkflowLocalDraft, removeWorkflowLocalDraft } from '@/web/core/workflow/localDraft';

export const restoreWorkflowLocalDraftAfterLogin = async ({
  user,
  fallbackRoute,
  saveDraft,
  onAccountMismatch,
  onRestoreSuccess,
  onRestoreFailed
}: {
  user: UserType;
  fallbackRoute: string;
  saveDraft: typeof postPublishApp;
  onAccountMismatch?: () => void;
  onRestoreSuccess?: () => void;
  onRestoreFailed?: () => void;
}) => {
  const draftResult = checkWorkflowLocalDraft({
    user,
    route: fallbackRoute
  });

  if (draftResult.status === 'account-mismatch') {
    onAccountMismatch?.();
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
    onRestoreSuccess?.();
  } catch (error) {
    onRestoreFailed?.();
  }

  return draftResult.route;
};

export const useWorkflowLocalDraftRestore = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  return useCallback(
    async ({ user, fallbackRoute }: { user: UserType; fallbackRoute: string }): Promise<string> => {
      return restoreWorkflowLocalDraftAfterLogin({
        user,
        fallbackRoute,
        saveDraft: postPublishApp,
        onAccountMismatch: () =>
          toast({
            status: 'warning',
            title: t('workflow:workflow.local_draft_account_mismatch')
          }),
        onRestoreSuccess: () =>
          toast({
            status: 'success',
            title: t('workflow:workflow.local_draft_restore_success')
          }),
        onRestoreFailed: () =>
          toast({
            status: 'warning',
            title: t('workflow:workflow.local_draft_restore_failed')
          })
      });
    },
    [t, toast]
  );
};
