import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getInviteLinkIdFromRoute } from '@/web/support/user/loginRedirect/invitation';
import { UNSET_TEAM_MEMBER_NAME } from '@fastgpt/global/support/user/team/constant';
import type { GetUnreadInformResponseType } from '@fastgpt/global/openapi/support/user/inform/api';
import type { UserInformSchema } from '@fastgpt/global/support/user/inform/type';
import { shouldPromptContactBinding } from '@/web/support/user/inform/utils';
import {
  finishPostLoginAction,
  getNextPostLoginAction,
  isPostLoginActionRoute,
  startPostLoginAction,
  type OneTimePostLoginAction,
  type PostLoginAction,
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
const CONTACT_HANDLED_EVENT = 'fastgpt:login-action:bind-contact-handled-changed';

const getContactHandledKey = (userId: string) => `${CONTACT_HANDLED_KEY_PREFIX}${userId}`;

/**
 * 读取当前用户是否已处理过“绑定联系方式”引导。
 * 只允许在客户端调用，供 useSyncExternalStore 的 getSnapshot 使用。
 */
const readContactHandled = (userId?: string) =>
  !!userId && window.localStorage.getItem(getContactHandledKey(userId)) === '1';

/**
 * 订阅已处理标记的变更：写入后派发的自定义事件覆盖当前标签页，
 * storage 事件覆盖其他标签页，保证渲染读到的始终是最新值。
 */
const subscribeContactHandled = (onChange: () => void) => {
  window.addEventListener(CONTACT_HANDLED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CONTACT_HANDLED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

type PostLoginActionOrchestratorProps = {
  importantInforms: UserInformSchema[];
  importantInformQueryError: boolean;
  refetchImportantInforms: () => Promise<{
    isError?: boolean;
    data?: GetUnreadInformResponseType;
  }>;
  unreadQueryFetched: boolean;
};

/** 渲染单个登录后动作所需的上下文，由各业务弹窗按需取用。 */
type PostLoginActionViewProps = {
  inviteLinkId: string;
  importantInforms: UserInformSchema[];
  importantInformQueryError: boolean;
  refetchImportantInforms: () => Promise<{
    isError?: boolean;
    data?: GetUnreadInformResponseType;
  }>;
  onStartInvitation: () => void;
  onFinishInvitation: () => void;
  onFinishContact: () => void;
  onFinishImportantInform: () => void;
  onFinishOneTimeAction: (action: OneTimePostLoginAction) => void;
};

/**
 * 动作到弹窗的映射表。key 覆盖 PostLoginAction 全集，新增动作时 TypeScript 会强制补齐渲染分支，
 * 避免只改了顺序逻辑却漏了渲染。邀请动作在链接已被清理时返回 null，由编排器继续释放锁。
 */
const POST_LOGIN_ACTION_VIEWS: Record<
  PostLoginAction,
  (props: PostLoginActionViewProps) => ReactNode
> = {
  invitation: ({ inviteLinkId, onStartInvitation, onFinishInvitation }) =>
    inviteLinkId ? (
      <HandleInviteModal
        inviteLinkId={inviteLinkId}
        onStart={onStartInvitation}
        onFinish={onFinishInvitation}
      />
    ) : null,
  memberName: ({ onFinishOneTimeAction }) => (
    <ForceMemberNameModal onSuccess={() => onFinishOneTimeAction('memberName')} />
  ),
  resetExpiredPassword: ({ onFinishOneTimeAction }) => (
    <ResetExpiredPswModal enabled onFinish={() => onFinishOneTimeAction('resetExpiredPassword')} />
  ),
  contact: ({ onFinishContact }) => <UpdateContact onClose={onFinishContact} mode="contact" />,
  systemMessage: ({ onFinishOneTimeAction }) => (
    <SystemMsgModal enabled onFinish={() => onFinishOneTimeAction('systemMessage')} />
  ),
  importantInform: ({
    importantInforms,
    importantInformQueryError,
    refetchImportantInforms,
    onFinishImportantInform
  }) => (
    <ImportantInform
      enabled
      informs={importantInforms}
      refetch={refetchImportantInforms}
      queryError={importantInformQueryError}
      onResolved={onFinishImportantInform}
    />
  ),
  activityAd: ({ onFinishOneTimeAction }) => (
    <ActivityAdModal enabled onFinish={() => onFinishOneTimeAction('activityAd')} />
  ),
  enterpriseAuthNotice: ({ onFinishOneTimeAction }) => (
    <EnterpriseAuthNoticeModal
      enabled
      onFinish={() => onFinishOneTimeAction('enterpriseAuthNotice')}
    />
  )
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

  // localStorage 属于渲染外部的可变数据源，统一通过 useSyncExternalStore 订阅，
  // 不在渲染体里同步读取；服务端渲染阶段固定视为未处理。
  const contactHandled = useSyncExternalStore(
    subscribeContactHandled,
    () => readContactHandled(userId),
    () => false
  );
  const invitationInProgress = invitationProgress.key === runKey && invitationProgress.active;
  const invitationActionLinkId = invitationInProgress ? invitationProgress.linkId : inviteLinkId;

  const shouldShowContact = shouldPromptContactBinding({
    isPlus,
    bindNotificationMethod: feConfigs?.bind_notification_method,
    contact: userInfo?.contact
  });

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

    // 编排锁只能在路由、用户信息和未读通知这些异步输入全部就绪后提交，
    // 放到渲染期提交会触发 react-hooks/set-state-in-render，所以保留在 effect 中。
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 动作锁依赖异步就绪状态，无法在渲染期派生
    setRunState((state) => startPostLoginAction({ state, key: runKey, action: nextAction }));
  }, [canStart, currentAction, nextAction, runKey]);

  const activeAction = canStart ? currentAction : undefined;

  const finishContact = useCallback(() => {
    if (userId) {
      window.localStorage.setItem(getContactHandledKey(userId), '1');
      // 主动派发变更事件，避免依赖下一次渲染才拿到最新标记。
      window.dispatchEvent(new Event(CONTACT_HANDLED_EVENT));
    }
    finishOneTimeAction('contact');
  }, [finishOneTimeAction, userId]);

  if (!activeAction) return null;

  // 动作与弹窗的对应关系集中在 POST_LOGIN_ACTION_VIEWS，这里只负责把上下文传进去。
  const renderAction = POST_LOGIN_ACTION_VIEWS[activeAction];

  return (
    <>
      {renderAction({
        inviteLinkId: invitationActionLinkId,
        importantInforms,
        importantInformQueryError,
        refetchImportantInforms,
        onStartInvitation: startInvitation,
        onFinishInvitation: finishInvitation,
        onFinishContact: finishContact,
        onFinishImportantInform: finishImportantInform,
        onFinishOneTimeAction: finishOneTimeAction
      })}
    </>
  );
};

export default PostLoginActionOrchestrator;
