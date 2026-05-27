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

/**
 * 在没有命中工作流本地草稿时，兜底判断登录前后的团队身份是否一致。
 *
 * 注意：该函数必须在登录页调用 `setUserInfo` 之前执行，因为 `setUserInfo`
 * 会把本轮登录的 tmbId 写入全局 lastAuthTmbId。这里读取到的 lastAuthTmbId
 * 应该代表「上一轮已登录团队」，用于避免用户登出后切到另一个团队账号时，
 * 仍然跳回旧团队上下文中的 lastRoute。
 */
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
 * 登录成功后的回跳规则：
 * 1. 有工作流草稿时，只恢复 tmbId 与当前登录团队一致的草稿；
 * 2. 草稿属于其他团队账号时，丢弃草稿并回到默认工作台，不能继续复用旧团队 lastRoute；
 * 3. 未命中工作流草稿恢复时，用全局最近登录 tmbId 拦截跨团队 lastRoute 跳转；
 * 4. 身份一致或没有历史身份记录时，继续使用登录流程给出的 fallbackRoute。
 *
 * 工作流草稿的优先级高于全局 lastAuthTmbId。这样可以覆盖多标签页场景：
 * A 标签页正在编辑工作流，B 标签页切换团队并登出后，A 标签页本地草稿仍应以
 * 保存草稿时写入的 tmbId 为准，而不是被 B 标签页更新后的全局登录状态污染。
 *
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

  // 没有可恢复草稿时，才进入普通登录 lastRoute 的跨团队保护。
  if (draftResult.status !== 'matched') {
    return getSafeFallbackRouteAfterLogin({ user, fallbackRoute });
  }

  const draftTmbId = draftResult.draft.tmbId;

  // 草稿以保存时的 tmbId 为准，避免其他标签页切团队后污染登录恢复。
  if (draftTmbId !== user.team?.tmbId) {
    removeWorkflowLocalDraft();
    // 草稿命中但团队不一致，说明当前 lastRoute 很可能仍指向旧团队工作流，必须回默认页。
    return DEFAULT_LOGIN_ROUTE;
  }

  await saveWorkflowDraftWithRetry({
    draft: draftResult.draft,
    saveDraft
  });

  removeWorkflowLocalDraft();

  // 草稿恢复成功或重试耗尽后，都固定回到草稿所属 app 的详情页。
  return draftResult.route;
};

/**
 * 登录页使用的工作流本地草稿恢复 hook。
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
