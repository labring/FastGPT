import { useCallback } from 'react';
import type { UserType } from '@fastgpt/global/support/user/type';
import {
  type WorkflowLocalDraftRestoreResult,
  useWorkflowLocalDraftRestore
} from '@/web/core/workflow/localDraft/useWorkflowLocalDraftRestore';
import { getLastAuthTmbId } from '../lastTmbIdStorage';

const DEFAULT_LOGIN_ROUTE = '/dashboard/agent';

type RestoreWorkflowLocalDraft = (props: {
  user: UserType;
}) => Promise<WorkflowLocalDraftRestoreResult>;

/**
 * 计算普通登录成功后的兜底跳转地址。
 *
 * lastRoute 是登录前页面写入的浏览器状态，可能来自旧团队或其他标签页。
 * 因此只有本轮登录 tmbId 与上一轮已登录 tmbId 一致时，才允许继续使用 lastRoute。
 */
export const getSafeFallbackRouteAfterLogin = ({
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
 * 登录成功后的跳转协调层。
 *
 * 优先恢复工作流本地草稿；如果草稿属于其他团队账号，直接回到 dashboard，
 * 避免继续打开旧团队的 workflow lastRoute。没有可恢复草稿时，再执行通用的
 * last tmbId 校验和 lastRoute 跳转。
 */
export const resolveLoginRedirectAfterLogin = async ({
  user,
  fallbackRoute,
  restoreWorkflowLocalDraft
}: {
  user: UserType;
  fallbackRoute: string;
  restoreWorkflowLocalDraft: RestoreWorkflowLocalDraft;
}) => {
  const draftResult = await restoreWorkflowLocalDraft({ user });

  if (draftResult.status === 'restored') {
    return draftResult.route;
  }

  if (draftResult.status === 'mismatched-team') {
    return DEFAULT_LOGIN_ROUTE;
  }

  return getSafeFallbackRouteAfterLogin({ user, fallbackRoute });
};

/**
 * 登录页使用的跳转 hook。登录业务只依赖该协调层，不直接感知工作流草稿存储与恢复细节。
 */
export const useLoginRedirectAfterLogin = () => {
  const restoreWorkflowLocalDraft = useWorkflowLocalDraftRestore();

  return useCallback(
    ({ user, fallbackRoute }: { user: UserType; fallbackRoute: string }) => {
      return resolveLoginRedirectAfterLogin({
        user,
        fallbackRoute,
        restoreWorkflowLocalDraft
      });
    },
    [restoreWorkflowLocalDraft]
  );
};
