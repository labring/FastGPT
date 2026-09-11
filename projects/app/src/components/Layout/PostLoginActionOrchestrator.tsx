import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getInviteLinkIdFromRoute } from '@/web/support/user/loginRedirect/invitation';
import { UNSET_TEAM_MEMBER_NAME } from '@fastgpt/global/support/user/team/constant';
import type { GetUnreadInformResponseType } from '@fastgpt/global/openapi/support/user/inform/api';
import type { UserInformSchema } from '@fastgpt/global/support/user/inform/type';
import {
  finishPostLoginAction,
  getNextPostLoginAction,
  isPostLoginActionRoute,
  startPostLoginAction,
  type OneTimePostLoginAction,
  type PostLoginActionState
} from './postLoginAction';

const HandleInviteModal = dynamic(
  () => import('@/pageComponents/account/team/Invite/HandleInviteModal'),
  { ssr: false }
);
const ForceMemberNameModal = dynamic(() => import('./ForceMemberNameModal'), { ssr: false });
const ResetExpiredPswModal = dynamic(
  () => import('@/components/support/user/safe/ResetExpiredPswModal'),
  { ssr: false }
);
const SystemMsgModal = dynamic(() => import('@/components/support/user/inform/SystemMsgModal'), {
  ssr: false
});
const ImportantInform = dynamic(() => import('@/components/support/user/inform/ImportantInform'), {
  ssr: false
});
const UpdateContact = dynamic(() => import('@/components/support/user/inform/UpdateContactModal'), {
  ssr: false
});
const ActivityAdModal = dynamic(() => import('@/components/support/activity/ActivityAdModal'), {
  ssr: false
});
const EnterpriseAuthNoticeModal = dynamic(
  () => import('@/components/support/user/inform/EnterpriseAuthNoticeModal'),
  { ssr: false }
);

const CONTACT_HANDLED_KEY_PREFIX = 'fastgpt:login-action:bind-contact-handled:v3:';

const getContactHandledKey = (userId: string) => `${CONTACT_HANDLED_KEY_PREFIX}${userId}`;

type PostLoginActionOrchestratorProps = {
  importantInforms: UserInformSchema[];
  importantInformQueryError: boolean;
  refetchImportantInforms: () => Promise<{
    isError?: boolean;
    data?: GetUnreadInformResponseType;
  }>;
  unreadQueryFetched: boolean;
};

/**
 * 串行编排登录后的用户动作，保证邀请、成员名、联系方式和通知类弹窗不会同时出现。
 * 业务组件只负责自身展示和完成回调，动作顺序与启动条件集中在这里维护。
 */
const PostLoginActionOrchestrator = ({
  importantInforms,
  importantInformQueryError,
  refetchImportantInforms,
  unreadQueryFetched
}: PostLoginActionOrchestratorProps) => {
  const router = useRouter();
  const { feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();
  const userId = userInfo?._id;
  const teamId = userInfo?.team?.teamId;
  const inviteLinkId = getInviteLinkIdFromRoute(router.asPath);
  const isPlus = !!feConfigs?.isPlus;
  const canRunPostLoginActions = isPostLoginActionRoute(router.pathname);
  const runKey = userId && teamId ? `${userId}:${teamId}` : '';

  const [runState, setRunState] = useState<PostLoginActionState>({
    key: '',
    completed: new Set<OneTimePostLoginAction>()
  });
  const [invitationProgress, setInvitationProgress] = useState<{
    key: string;
    linkId: string;
    active: boolean;
  }>({ key: '', linkId: '', active: false });

  const contactHandled =
    !!userId && window.localStorage.getItem(getContactHandledKey(userId)) === '1';
  const invitationInProgress = invitationProgress.key === runKey && invitationProgress.active;
  const invitationActionLinkId = invitationInProgress ? invitationProgress.linkId : inviteLinkId;

  const shouldShowContact =
    isPlus &&
    !!feConfigs?.bind_notification_method?.length &&
    !userInfo?.contact &&
    !!userInfo?.team?.permission?.isOwner;

  const canStart =
    router.isReady &&
    canRunPostLoginActions &&
    isPlus &&
    !!userId &&
    !!teamId &&
    unreadQueryFetched;

  const finishOneTimeAction = useCallback(
    (action: OneTimePostLoginAction) => {
      setRunState((state) => finishPostLoginAction({ state, key: runKey, action }));
    },
    [runKey]
  );

  const finishImportantInform = useCallback(() => {
    setRunState((state) =>
      finishPostLoginAction({ state, key: runKey, action: 'importantInform' })
    );
  }, [runKey]);

  const finishInvitation = useCallback(() => {
    setInvitationProgress({ key: runKey, linkId: '', active: false });
    finishOneTimeAction('invitation');
  }, [finishOneTimeAction, runKey]);

  const startInvitation = useCallback(() => {
    setInvitationProgress({ key: runKey, linkId: inviteLinkId, active: true });
  }, [inviteLinkId, runKey]);

  const currentAction = runState.key === runKey ? runState.currentAction : undefined;
  const completed =
    runState.key === runKey ? runState.completed : new Set<OneTimePostLoginAction>();
  const nextAction = getNextPostLoginAction({
    canStart,
    currentAction,
    completed,
    inviteLinkId: invitationActionLinkId,
    hasPendingMemberName: userInfo?.team?.memberName === UNSET_TEAM_MEMBER_NAME,
    shouldShowContact,
    contactHandled,
    isPlus,
    hasImportantInform: importantInforms.length > 0
  });

  useEffect(() => {
    if (!canStart || !runKey || currentAction || !nextAction) return;

    // The effect commits the derived action into the orchestrator lock before the next external update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRunState((state) => startPostLoginAction({ state, key: runKey, action: nextAction }));
  }, [canStart, currentAction, nextAction, runKey]);

  const activeAction = canStart ? currentAction : undefined;

  const finishContact = useCallback(() => {
    if (userId) {
      window.localStorage.setItem(getContactHandledKey(userId), '1');
    }
    finishOneTimeAction('contact');
  }, [finishOneTimeAction, userId]);

  if (activeAction === 'invitation' && invitationActionLinkId) {
    return (
      <HandleInviteModal
        inviteLinkId={invitationActionLinkId}
        onStart={startInvitation}
        onFinish={finishInvitation}
      />
    );
  }

  if (activeAction === 'memberName') {
    return <ForceMemberNameModal onSuccess={() => finishOneTimeAction('memberName')} />;
  }

  if (activeAction === 'resetExpiredPassword') {
    return (
      <ResetExpiredPswModal enabled onFinish={() => finishOneTimeAction('resetExpiredPassword')} />
    );
  }

  if (activeAction === 'contact') {
    return <UpdateContact onClose={finishContact} mode="contact" />;
  }

  if (activeAction === 'systemMessage') {
    return <SystemMsgModal enabled onFinish={() => finishOneTimeAction('systemMessage')} />;
  }

  if (activeAction === 'importantInform') {
    return (
      <ImportantInform
        enabled
        informs={importantInforms}
        refetch={refetchImportantInforms}
        queryError={importantInformQueryError}
        onResolved={finishImportantInform}
      />
    );
  }

  if (activeAction === 'activityAd') {
    return <ActivityAdModal enabled onFinish={() => finishOneTimeAction('activityAd')} />;
  }

  if (activeAction === 'enterpriseAuthNotice') {
    return (
      <EnterpriseAuthNoticeModal
        enabled
        onFinish={() => finishOneTimeAction('enterpriseAuthNotice')}
      />
    );
  }

  return null;
};

export default PostLoginActionOrchestrator;
