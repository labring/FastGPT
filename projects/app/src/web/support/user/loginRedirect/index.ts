import { useCallback } from 'react';
import type { UserType } from '@fastgpt/global/support/user/type';
import { accountCancellationActiveStatuses } from '@fastgpt/global/support/user/account/cancellation/constants';
import {
  type WorkflowLocalDraftRestoreResult,
  useWorkflowLocalDraftRestore
} from '@/web/core/workflow/localDraft/useWorkflowLocalDraftRestore';
import { getInviteLinkIdFromRoute } from './invitation';

const DEFAULT_LOGIN_ROUTE = '/dashboard/agent';

type RestoreWorkflowLocalDraft = (props: {
  user: UserType;
  fallbackAppId?: string;
}) => Promise<WorkflowLocalDraftRestoreResult>;

/**
 * 计算普通登录成功后的兜底跳转地址。
 *
 * lastRoute 是登录前页面写入的浏览器状态，可能来自旧团队或其他标签页。
 * 只有 403 跳登录时 query 携带了当前标签页的 lastTmbId，才做跨团队拦截。
 */
export const getSafeFallbackRouteAfterLogin = ({
  user,
  fallbackRoute,
  lastTmbId
}: {
  user: UserType;
  fallbackRoute: string;
  lastTmbId?: string;
}) => {
  if (lastTmbId && lastTmbId !== user.team?.tmbId) {
    return DEFAULT_LOGIN_ROUTE;
  }

  return fallbackRoute;
};

/**
 * 登录成功后的跳转协调层。
 *
 * 账号注销流程优先级最高；有效邀请路由优先于工作流草稿，避免用户明确打开的邀请
 * 被浏览器中的历史草稿覆盖。其余场景优先恢复当前成员的草稿。
 * 无 lastTmbId 时，回跳应用的草稿可补充跨团队判断。
 */
export const resolveLoginRedirectAfterLogin = async ({
  user,
  fallbackRoute,
  lastTmbId,
  restoreWorkflowLocalDraft
}: {
  user: UserType;
  fallbackRoute: string;
  lastTmbId?: string;
  restoreWorkflowLocalDraft: RestoreWorkflowLocalDraft;
}) => {
  const cancellationStatus =
    user.accountCancellation?.status ?? user.team?.accountCancellation?.status;
  if (
    accountCancellationActiveStatuses.includes(
      cancellationStatus as (typeof accountCancellationActiveStatuses)[number]
    )
  ) {
    return '/account/cancel';
  }

  if (getInviteLinkIdFromRoute(fallbackRoute)) {
    return fallbackRoute;
  }

  const fallbackAppId = (() => {
    if (lastTmbId) return;
    try {
      const url = new URL(fallbackRoute, 'http://fastgpt.local');
      if (url.pathname.endsWith('/app/detail')) return url.searchParams.get('appId') ?? undefined;
    } catch {
      // 回跳地址无法解析时，仍允许恢复当前成员自己的草稿。
    }
  })();
  const draftResult = await restoreWorkflowLocalDraft({ user, fallbackAppId });

  if (draftResult.status === 'restored') {
    return draftResult.route;
  }

  if (draftResult.status === 'mismatched-team') {
    return DEFAULT_LOGIN_ROUTE;
  }

  return getSafeFallbackRouteAfterLogin({ user, fallbackRoute, lastTmbId });
};

/**
 * 登录页使用的跳转 hook。登录业务只依赖该协调层，不直接感知工作流草稿存储与恢复细节。
 */
export const useLoginRedirectAfterLogin = () => {
  const restoreWorkflowLocalDraft = useWorkflowLocalDraftRestore();

  return useCallback(
    ({
      user,
      fallbackRoute,
      lastTmbId
    }: {
      user: UserType;
      fallbackRoute: string;
      lastTmbId?: string;
    }) => {
      return resolveLoginRedirectAfterLogin({
        user,
        fallbackRoute,
        lastTmbId,
        restoreWorkflowLocalDraft
      });
    },
    [restoreWorkflowLocalDraft]
  );
};
