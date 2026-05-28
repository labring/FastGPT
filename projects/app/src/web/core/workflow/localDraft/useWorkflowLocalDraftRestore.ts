import { useCallback } from 'react';
import type { UserType } from '@fastgpt/global/support/user/type';
import { postPublishApp } from '@/web/core/app/api/version';
import {
  checkWorkflowLocalDraft,
  type WorkflowLocalDraft,
  removeWorkflowLocalDraft
} from './storage';
import { useRequest } from '@fastgpt/web/hooks/useRequest';

const WORKFLOW_DRAFT_RESTORE_SAVE_MAX_RETRY = 3;

export type WorkflowLocalDraftRestoreResult =
  | {
      status: 'restored';
      route: string;
    }
  | {
      status: 'mismatched-team' | 'not-found';
    };

/**
 * 把本地工作流草稿补保存到远端自动保存版本。
 *
 * 这里的失败只影响本地草稿恢复，不应该阻断登录后的页面跳转，也不需要给用户提示。
 * 因此内部静默重试固定次数：临时网络抖动有机会恢复；重试耗尽后由调用方删除本地草稿并继续跳转。
 */
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
 * 登录成功后尝试恢复工作流本地草稿。
 *
 * 工作流草稿只以保存时的 tmbId 判断是否可恢复。这样可以覆盖多标签页场景：
 * A 标签页正在编辑工作流，B 标签页切换团队并登出后，A 标签页本地草稿仍应以
 * 保存草稿时写入的 tmbId 为准，而不是被 B 标签页更新后的全局登录状态污染。
 *
 * 恢复请求最多重试 3 次；仍失败时丢弃本地草稿并返回恢复成功路由。
 * 普通 lastRoute fallback 和跨团队默认跳转由登录跳转协调层处理。
 */
export const restoreWorkflowLocalDraftAfterLogin = async ({
  user,
  saveDraft
}: {
  user: UserType;
  saveDraft: typeof postPublishApp;
}): Promise<WorkflowLocalDraftRestoreResult> => {
  const draftResult = checkWorkflowLocalDraft();

  if (draftResult.status !== 'matched') {
    return { status: 'not-found' };
  }

  const draftTmbId = draftResult.draft.tmbId;

  // 草稿以保存时的 tmbId 为准，避免其他标签页切团队后污染登录恢复。
  if (draftTmbId !== user.team?.tmbId) {
    removeWorkflowLocalDraft();
    return { status: 'mismatched-team' };
  }

  await saveWorkflowDraftWithRetry({
    draft: draftResult.draft,
    saveDraft
  });

  removeWorkflowLocalDraft();

  // 草稿恢复成功或重试耗尽后，都固定回到草稿所属 app 的详情页。
  return {
    status: 'restored',
    route: draftResult.route
  };
};

/**
 * 登录后跳转协调层使用的工作流本地草稿恢复 hook。
 *
 * `postPublishApp` 通过 useRequest 包装，主要是复用全局请求链路；这里显式关闭错误 toast，
 * 因为草稿恢复失败已经被 `saveWorkflowDraftWithRetry` 静默处理，不能打断登录跳转体验。
 */
export const useWorkflowLocalDraftRestore = () => {
  const { runAsync: saveWorkflowLocalDraft } = useRequest(postPublishApp, {
    manual: true,
    errorToast: ''
  });

  return useCallback(
    async ({ user }: { user: UserType }): Promise<WorkflowLocalDraftRestoreResult> => {
      return restoreWorkflowLocalDraftAfterLogin({
        user,
        saveDraft: saveWorkflowLocalDraft
      });
    },
    [saveWorkflowLocalDraft]
  );
};
